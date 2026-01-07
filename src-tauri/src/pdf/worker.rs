//! PDF Worker 執行緒
//!
//! 處理 PDF 文件的所有操作，包括開啟、渲染、編輯、儲存等。

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use image::GenericImageView;
use log::warn;
use once_cell::sync::Lazy;
use pdfium_render::prelude::{PdfDocument, PdfPagePaperSize, PdfPoints};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    mpsc, Mutex,
};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::MediaError;
use crate::image::image_dpi_from_bytes;
use crate::pdf::{
    get_pdfium, render_page_for_document, AddImageResult, ImageToPdfResult, MutationResult,
    PageRender, PageTextContent, PdfOpenResult, PdfPageSize, PdfRenderArgs, RotationResult,
    SaveResult, TextLayerSettings, TextSpan,
};

// ============================================================================
// Static variables
// ============================================================================

pub static WORKER_TX: Lazy<Mutex<Option<mpsc::Sender<PdfRequest>>>> =
    Lazy::new(|| Mutex::new(None));
static NEXT_DOC_ID: AtomicU64 = AtomicU64::new(1);
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(1);

// ============================================================================
// Constants
// ============================================================================

const TEXT_CACHE_DIR_NAME: &str = "db";
const TEXT_CACHE_DB_FILE: &str = "page_text_cache.db";
const TEXT_EXTRACTOR_VERSION: i64 = 2;
const TEXT_CACHE_SOFT_LIMIT_BYTES: i64 = 50 * 1024 * 1024;

// ============================================================================
// Internal types
// ============================================================================

struct PdfDocRecord<'a> {
    doc: PdfDocument<'a>,
    path: String,
    file_size: Option<u64>,
    file_hash: Option<String>,
    dirty: bool,
    baseline_tokens: Vec<u64>,
    current_tokens: Vec<u64>,
    baseline_rot: Vec<u16>,
    current_rot: Vec<u16>,
    next_token: u64,
    revision: u64,
    undo_stack: Vec<HistoryEvent>,
    redo_stack: Vec<HistoryEvent>,
}

#[derive(Clone)]
enum HistoryEvent {
    Rotate { index: u32, from: u16, to: u16 },
    InsertBlank { index: u32, count: usize, width_pt: f32, height_pt: f32 },
    InsertFromPdf { index: u32, count: usize, temp_path: PathBuf },
    Delete { index: u32, count: usize, temp_path: PathBuf, tokens: Vec<u64>, rotations: Vec<u16> },
}

#[derive(Clone)]
struct CacheKey {
    file_hash: String,
    file_size: u64,
    page_index: u32,
    rotation_deg: u16,
    extractor_version: i64,
}

struct GlyphCache {
    conn: Connection,
}

// ============================================================================
// Helper functions
// ============================================================================

fn unix_ts_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn u64_to_i64(v: u64) -> i64 {
    i64::try_from(v).unwrap_or(i64::MAX)
}

fn u32_to_i64(v: u32) -> i64 {
    i64::try_from(v).unwrap_or(i64::MAX)
}

fn rotation_to_degrees(rot: pdfium_render::prelude::PdfPageRenderRotation) -> u16 {
    match rot {
        pdfium_render::prelude::PdfPageRenderRotation::None => 0,
        pdfium_render::prelude::PdfPageRenderRotation::Degrees90 => 90,
        pdfium_render::prelude::PdfPageRenderRotation::Degrees180 => 180,
        pdfium_render::prelude::PdfPageRenderRotation::Degrees270 => 270,
    }
}

fn rotations_for_doc(doc: &PdfDocument) -> Result<Vec<u16>, MediaError> {
    let page_count: usize = doc.pages().len() as usize;
    let mut rotations = Vec::with_capacity(page_count);
    for idx in 0..page_count {
        let idx_u16: u16 = idx
            .try_into()
            .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", idx)))?;
        let page = doc
            .pages()
            .get(idx_u16)
            .map_err(|_| MediaError::new("not_found", format!("頁索引不存在: {}", idx)))?;
        let rot = page
            .rotation()
            .map_err(|e| MediaError::new("io_error", format!("取得頁面旋轉失敗: {e}")))?;
        rotations.push(rotation_to_degrees(rot));
    }
    Ok(rotations)
}

fn init_tokens_for_doc(doc: &PdfDocument) -> Result<(Vec<u64>, Vec<u16>, u64), MediaError> {
    let page_count: usize = doc.pages().len() as usize;
    let mut tokens = Vec::with_capacity(page_count);
    for i in 0..page_count {
        tokens.push(i as u64 + 1);
    }
    let rotations = rotations_for_doc(doc)?;
    let next_token = tokens.len() as u64 + 1;
    Ok((tokens, rotations, next_token))
}

fn recompute_dirty(record: &mut PdfDocRecord) {
    record.dirty = record.baseline_tokens != record.current_tokens
        || record.baseline_rot != record.current_rot;
}

fn temp_pdf_path(prefix: &str) -> PathBuf {
    let mut p = std::env::temp_dir();
    let ts = unix_ts_secs();
    let seq = TEMP_COUNTER.fetch_add(1, Ordering::SeqCst);
    p.push(format!("{prefix}-{ts}-{seq}.pdf"));
    p
}

fn push_undo(record: &mut PdfDocRecord, ev: HistoryEvent) {
    record.undo_stack.push(ev);
    record.redo_stack.clear();
}

fn build_ranges(indices: &[u32]) -> String {
    let mut ranges: Vec<(u32, u32)> = Vec::new();
    for &p in indices {
        if let Some(last) = ranges.last_mut() {
            if p == last.1 + 1 {
                last.1 = p;
                continue;
            }
        }
        ranges.push((p, p));
    }
    let mut spec = String::new();
    for (i, (a, b)) in ranges.iter().enumerate() {
        if i > 0 {
            spec.push(',');
        }
        if a == b {
            spec.push_str(&format!("{}", a));
        } else {
            spec.push_str(&format!("{}-{}", a, b));
        }
    }
    spec
}

fn capture_pages_to_temp(
    pdfium: &pdfium_render::prelude::Pdfium,
    doc: &PdfDocument,
    indices: &[u32],
) -> Result<PathBuf, MediaError> {
    if indices.is_empty() {
        return Err(MediaError::new("invalid_input", "缺少頁索引"));
    }
    let mut tmp = pdfium.create_new_pdf().map_err(|e| {
        MediaError::new("io_error", format!("建立暫存 PDF 失敗: {e}"))
    })?;
    let indices_1: Vec<u32> = indices.iter().map(|&i| i + 1).collect();
    let spec = build_ranges(&indices_1);
    tmp.pages_mut()
        .copy_pages_from_document(doc, &spec, 0)
        .map_err(|e| MediaError::new("io_error", format!("複製頁面到暫存 PDF 失敗: {e}")))?;
    let path = temp_pdf_path("undo-pages");
    tmp.save_to_file(&path)
        .map_err(|e| MediaError::new("io_error", format!("寫入暫存 PDF 失敗: {e}")))?;
    Ok(path)
}

fn delete_indices<'a>(
    pdfium: &'a pdfium_render::prelude::Pdfium,
    record: &mut PdfDocRecord<'a>,
    mut indices: Vec<u32>,
) -> Result<(), MediaError> {
    let page_count = record.doc.pages().len();
    if page_count == 0 {
        return Err(MediaError::new("invalid_input", "文件沒有任何頁面"));
    }
    if indices.is_empty() {
        return Err(MediaError::new("invalid_input", "缺少要刪除的頁索引"));
    }
    indices.sort_unstable();
    indices.dedup();
    if let Some(max) = indices.last() {
        if *max >= page_count as u32 {
            return Err(MediaError::new(
                "invalid_input",
                format!("頁索引超出範圍: {} >= {}", max, page_count),
            ));
        }
    }
    let mut keep: Vec<u32> = (0..(page_count as u32)).collect();
    let del: HashSet<u32> = indices.into_iter().collect();
    keep.retain(|i| !del.contains(i));
    if keep.is_empty() {
        return Err(MediaError::new(
            "invalid_input",
            "無法刪除所有頁面，至少需保留一頁",
        ));
    }
    let mut pages_1: Vec<u32> = keep.into_iter().map(|i| i + 1).collect();
    pages_1.sort_unstable();
    let spec_keep = build_ranges(&pages_1);
    let mut new_doc = pdfium.create_new_pdf().map_err(|e| {
        MediaError::new("io_error", format!("建立新 PDF 失敗: {e}"))
    })?;
    new_doc
        .pages_mut()
        .copy_pages_from_document(&record.doc, &spec_keep, 0)
        .map_err(|e| MediaError::new("io_error", format!("複製頁面失敗: {e}")))?;
    let new_len: usize = new_doc.pages().len() as usize;
    let mut new_tokens: Vec<u64> = Vec::with_capacity(new_len);
    let mut new_rot: Vec<u16> = Vec::with_capacity(new_len);
    for (idx, (tok, rot)) in record
        .current_tokens
        .iter()
        .copied()
        .zip(record.current_rot.iter().copied())
        .enumerate()
    {
        if !del.contains(&(idx as u32)) {
            new_tokens.push(tok);
            new_rot.push(rot);
        }
    }
    record.doc = new_doc;
    record.current_tokens = new_tokens;
    record.current_rot = new_rot;
    record.file_hash = None;
    record.file_size = None;
    record.revision = record.revision.saturating_add(1);
    recompute_dirty(record);
    Ok(())
}

fn insert_blank_at(
    record: &mut PdfDocRecord,
    index: u32,
    width_pt: f32,
    height_pt: f32,
) -> Result<(), MediaError> {
    let size = PdfPagePaperSize::Custom(PdfPoints::new(width_pt), PdfPoints::new(height_pt));
    let idx_u16: u16 = index
        .try_into()
        .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", index)))?;
    {
        let pages = record.doc.pages_mut();
        pages.create_page_at_index(size, idx_u16).map_err(|e| {
            MediaError::new("io_error", format!("插入空白頁失敗: {e}"))
        })?;
    }
    let insert_at: usize = index
        .try_into()
        .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", index)))?;
    if insert_at > record.current_tokens.len() || insert_at > record.current_rot.len() {
        return Err(MediaError::new(
            "invalid_input",
            "內部頁序列長度不一致，無法插入",
        ));
    }
    record
        .current_tokens
        .insert(insert_at, record.next_token);
    record.next_token = record.next_token.saturating_add(1);
    record.current_rot.insert(insert_at, 0);
    record.file_hash = None;
    record.file_size = None;
    record.revision = record.revision.saturating_add(1);
    recompute_dirty(record);
    Ok(())
}

fn insert_from_pdf_path(
    pdfium: &pdfium_render::prelude::Pdfium,
    record: &mut PdfDocRecord,
    index: u32,
    path: &Path,
) -> Result<usize, MediaError> {
    let idx_dest_u16: u16 = index
        .try_into()
        .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", index)))?;
    let insert_at: usize = index
        .try_into()
        .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", index)))?;
    if insert_at > record.current_tokens.len() || insert_at > record.current_rot.len() {
        return Err(MediaError::new(
            "invalid_input",
            "內部頁序列長度不一致，無法插入",
        ));
    }
    let src_doc = pdfium.load_pdf_from_file(path, None).map_err(|e| {
        MediaError::new(
            "io_error",
            format!("載入暫存 PDF 失敗以便插入：{e}"),
        )
    })?;
    let page_count: usize = src_doc.pages().len() as usize;
    let spec = if page_count == 1 {
        "1".to_string()
    } else {
        format!("1-{}", page_count)
    };
    record
        .doc
        .pages_mut()
        .copy_pages_from_document(&src_doc, &spec, idx_dest_u16)
        .map_err(|e| MediaError::new("io_error", format!("插入頁面失敗: {e}")))?;

    let mut rotations: Vec<u16> = Vec::with_capacity(page_count);
    for i in 0..page_count {
        let idx_u16: u16 = (i as u32)
            .try_into()
            .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", i)))?;
        rotations.push(page_rotation_deg(&src_doc, idx_u16)?);
    }
    for i in 0..page_count {
        record
            .current_tokens
            .insert(insert_at + i, record.next_token);
        record.next_token = record.next_token.saturating_add(1);
        record
            .current_rot
            .insert(insert_at + i, *rotations.get(i).unwrap_or(&0));
    }
    record.file_hash = None;
    record.file_size = None;
    record.revision = record.revision.saturating_add(1);
    recompute_dirty(record);
    Ok(page_count)
}

fn apply_history_event<'a>(
    pdfium: &'a pdfium_render::prelude::Pdfium,
    record: &mut PdfDocRecord<'a>,
    ev: &HistoryEvent,
    forward: bool,
) -> Result<(), MediaError> {
    match ev {
        HistoryEvent::Rotate { index, from, to } => {
            let target = if forward { *to } else { *from };
            let rot = match target {
                0 => pdfium_render::prelude::PdfPageRenderRotation::None,
                90 => pdfium_render::prelude::PdfPageRenderRotation::Degrees90,
                180 => pdfium_render::prelude::PdfPageRenderRotation::Degrees180,
                270 => pdfium_render::prelude::PdfPageRenderRotation::Degrees270,
                _ => pdfium_render::prelude::PdfPageRenderRotation::None,
            };
            let idx_u16: u16 = (*index)
                .try_into()
                .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", index)))?;
            let idx_usize: usize = (*index)
                .try_into()
                .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", index)))?;
            {
                let mut page = record.doc.pages_mut().get(idx_u16).map_err(|_| {
                    MediaError::new("not_found", format!("頁索引不存在: {}", index))
                })?;
                page.set_rotation(rot);
            }
            if idx_usize >= record.current_rot.len() {
                return Err(MediaError::new(
                    "invalid_input",
                    "內部旋轉序列長度不一致，無法更新",
                ));
            }
            record.current_rot[idx_usize] = target;
            record.file_hash = None;
            record.file_size = None;
            record.revision = record.revision.saturating_add(1);
            recompute_dirty(record);
            Ok(())
        }
        HistoryEvent::InsertBlank {
            index,
            count,
            width_pt,
            height_pt,
        } => {
            if forward {
                for i in 0..*count {
                    insert_blank_at(record, index + i as u32, *width_pt, *height_pt)?;
                }
            } else {
                let start = *index;
                let inds: Vec<u32> = (start..start + (*count as u32)).collect();
                delete_indices(pdfium, record, inds)?;
            }
            Ok(())
        }
        HistoryEvent::InsertFromPdf {
            index,
            count,
            temp_path,
        } => {
            if forward {
                insert_from_pdf_path(pdfium, record, *index, temp_path)?;
            } else {
                let start = *index;
                let inds: Vec<u32> = (start..start + (*count as u32)).collect();
                delete_indices(pdfium, record, inds)?;
            }
            Ok(())
        }
        HistoryEvent::Delete {
            index,
            count,
            temp_path,
            tokens,
            rotations,
        } => {
            if forward {
                let start = *index;
                let inds: Vec<u32> = (start..start + (*count as u32)).collect();
                delete_indices(pdfium, record, inds)?;
            } else {
                // Restore pages from temp PDF
                let idx_dest_u16: u16 = (*index)
                    .try_into()
                    .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", index)))?;
                let insert_at: usize = (*index)
                    .try_into()
                    .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", index)))?;
                let src_doc = pdfium.load_pdf_from_file(temp_path, None).map_err(|e| {
                    MediaError::new("io_error", format!("載入暫存 PDF 失敗以便插入：{e}"))
                })?;
                let page_count: usize = src_doc.pages().len() as usize;
                let spec = if page_count == 1 {
                    "1".to_string()
                } else {
                    format!("1-{}", page_count)
                };
                record
                    .doc
                    .pages_mut()
                    .copy_pages_from_document(&src_doc, &spec, idx_dest_u16)
                    .map_err(|e| MediaError::new("io_error", format!("插入頁面失敗: {e}")))?;
                // Restore original tokens and rotations
                for (i, (&tok, &rot)) in tokens.iter().zip(rotations.iter()).enumerate() {
                    record.current_tokens.insert(insert_at + i, tok);
                    record.current_rot.insert(insert_at + i, rot);
                }
                record.file_hash = None;
                record.file_size = None;
                record.revision = record.revision.saturating_add(1);
                recompute_dirty(record);
            }
            Ok(())
        }
    }
}

fn page_rotation_deg(
    doc: &pdfium_render::prelude::PdfDocument,
    idx: u16,
) -> Result<u16, MediaError> {
    let page = doc
        .pages()
        .get(idx)
        .map_err(|_| MediaError::new("not_found", format!("頁索引不存在: {}", idx)))?;
    let rot = page
        .rotation()
        .map_err(|e| MediaError::new("io_error", format!("取得頁面旋轉失敗: {e}")))?;
    Ok(rotation_to_degrees(rot))
}

fn compute_file_hash(path: &str) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let read = file.read(&mut buf).ok()?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Some(format!("{:x}", hasher.finalize()))
}

// ============================================================================
// GlyphCache implementation
// ============================================================================

impl GlyphCache {
    fn new(base_dir: &Path) -> Result<Self, MediaError> {
        fs::create_dir_all(base_dir)
            .map_err(|e| MediaError::new("cache_error", format!("建立文字快取目錄失敗: {e}")))?;

        let db_path = base_dir.join(TEXT_CACHE_DB_FILE);
        let conn = Connection::open(db_path)
            .map_err(|e| MediaError::new("cache_error", format!("開啟文字快取資料庫失敗: {e}")))?;

        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let _ = conn.pragma_update(None, "synchronous", "NORMAL");

        conn.execute(
            "CREATE TABLE IF NOT EXISTS page_boxes (
                file_hash TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                page_index INTEGER NOT NULL,
                rotation INTEGER NOT NULL,
                extractor_version INTEGER NOT NULL,
                payload BLOB NOT NULL,
                payload_size INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (file_hash, file_size, page_index, rotation, extractor_version)
            )",
            [],
        )
        .map_err(|e| MediaError::new("cache_error", format!("初始化文字快取表失敗: {e}")))?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_page_boxes_updated_at ON page_boxes(updated_at)",
            [],
        )
        .ok();

        Ok(Self { conn })
    }

    fn get(&self, key: &CacheKey) -> Option<PageTextContent> {
        let mut stmt = self
            .conn
            .prepare_cached(
                "SELECT payload FROM page_boxes
                 WHERE file_hash = ?1 AND file_size = ?2 AND page_index = ?3
                 AND rotation = ?4 AND extractor_version = ?5",
            )
            .ok()?;

        let payload: Option<Vec<u8>> = stmt
            .query_row(
                params![
                    key.file_hash.as_str(),
                    u64_to_i64(key.file_size),
                    u32_to_i64(key.page_index),
                    i64::from(key.rotation_deg),
                    key.extractor_version
                ],
                |row| row.get(0),
            )
            .optional()
            .ok()?;

        let payload = payload?;

        let _ = self.conn.execute(
            "UPDATE page_boxes SET updated_at = ?1
             WHERE file_hash = ?2 AND file_size = ?3 AND page_index = ?4
             AND rotation = ?5 AND extractor_version = ?6",
            params![
                unix_ts_secs(),
                key.file_hash.as_str(),
                u64_to_i64(key.file_size),
                u32_to_i64(key.page_index),
                i64::from(key.rotation_deg),
                key.extractor_version
            ],
        );

        let mut decoder = GzDecoder::new(payload.as_slice());
        let mut buf: Vec<u8> = Vec::new();
        if decoder.read_to_end(&mut buf).is_err() {
            return None;
        }
        serde_json::from_slice(&buf).ok()
    }

    fn put(&self, key: &CacheKey, content: &PageTextContent) -> Result<(), MediaError> {
        let json = serde_json::to_vec(content)
            .map_err(|e| MediaError::new("cache_error", format!("序列化文字快取失敗: {e}")))?;

        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder
            .write_all(&json)
            .map_err(|e| MediaError::new("cache_error", format!("壓縮文字快取失敗: {e}")))?;
        let payload = encoder
            .finish()
            .map_err(|e| MediaError::new("cache_error", format!("完成壓縮失敗: {e}")))?;

        let payload_size = u64_to_i64(payload.len() as u64);
        let ts = unix_ts_secs();

        self.conn
            .execute(
                "INSERT OR REPLACE INTO page_boxes
                 (file_hash, file_size, page_index, rotation, extractor_version, payload, payload_size, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    key.file_hash.as_str(),
                    u64_to_i64(key.file_size),
                    u32_to_i64(key.page_index),
                    i64::from(key.rotation_deg),
                    key.extractor_version,
                    payload,
                    payload_size,
                    ts
                ],
            )
            .map_err(|e| MediaError::new("cache_error", format!("寫入文字快取失敗: {e}")))?;

        let _ = self.prune(TEXT_CACHE_SOFT_LIMIT_BYTES);
        Ok(())
    }

    fn prune(&self, budget_bytes: i64) -> rusqlite::Result<()> {
        let total: i64 = self.conn.query_row(
            "SELECT IFNULL(SUM(payload_size), 0) FROM page_boxes",
            [],
            |row| row.get(0),
        )?;

        if total <= budget_bytes {
            return Ok(());
        }

        let mut to_remove = total - budget_bytes;
        let mut stmt = self
            .conn
            .prepare("SELECT rowid, payload_size FROM page_boxes ORDER BY updated_at ASC")?;
        let mut rows = stmt.query([])?;
        let mut victims: Vec<i64> = Vec::new();

        while to_remove > 0 {
            if let Some(row) = rows.next()? {
                let rowid: i64 = row.get(0)?;
                let size: i64 = row.get(1)?;
                victims.push(rowid);
                if size >= to_remove {
                    break;
                }
                to_remove = to_remove.saturating_sub(size);
            } else {
                break;
            }
        }

        for rowid in victims {
            let _ = self
                .conn
                .execute("DELETE FROM page_boxes WHERE rowid = ?1", params![rowid]);
        }
        Ok(())
    }
}

// ============================================================================
// PdfRequest enum
// ============================================================================

pub enum PdfRequest {
    Open {
        path: String,
        reply: mpsc::Sender<Result<PdfOpenResult, MediaError>>,
    },
    Close {
        doc_id: u64,
        reply: mpsc::Sender<Result<(), MediaError>>,
    },
    Render {
        args: PdfRenderArgs,
        reply: mpsc::Sender<Result<PageRender, MediaError>>,
    },
    Size {
        doc_id: u64,
        page_index: u32,
        reply: mpsc::Sender<Result<PdfPageSize, MediaError>>,
    },
    Cancel {
        doc_id: u64,
        page_index: u32,
        min_gen: u64,
        reply: mpsc::Sender<Result<(), MediaError>>,
    },
    ExportImage {
        doc_id: u64,
        page_index: u32,
        dest_path: String,
        format: String,
        target_width: Option<u32>,
        dpi: Option<f32>,
        quality: Option<u8>,
        reply: mpsc::Sender<Result<(String, u32, u32, String), MediaError>>,
    },
    ExportPdf {
        doc_id: u64,
        page_index: u32,
        dest_path: String,
        reply: mpsc::Sender<Result<String, MediaError>>,
    },
    InsertBlank {
        doc_id: u64,
        index: u32,
        width_pt: f32,
        height_pt: f32,
        reply: mpsc::Sender<Result<MutationResult, MediaError>>,
    },
    DeletePages {
        doc_id: u64,
        indices: Vec<u32>,
        reply: mpsc::Sender<Result<MutationResult, MediaError>>,
    },
    RotatePage {
        doc_id: u64,
        index: u32,
        rotate_deg: u16,
        reply: mpsc::Sender<Result<RotationResult, MediaError>>,
    },
    RotatePageRelative {
        doc_id: u64,
        index: u32,
        delta_deg: i16,
        reply: mpsc::Sender<Result<RotationResult, MediaError>>,
    },
    CopyPage {
        src_doc_id: u64,
        src_index: u32,
        dest_doc_id: u64,
        dest_index: u32,
        reply: mpsc::Sender<Result<MutationResult, MediaError>>,
    },
    Undo {
        doc_id: u64,
        reply: mpsc::Sender<Result<MutationResult, MediaError>>,
    },
    Redo {
        doc_id: u64,
        reply: mpsc::Sender<Result<MutationResult, MediaError>>,
    },
    Save {
        doc_id: u64,
        dest_path: Option<String>,
        overwrite: Option<bool>,
        reply: mpsc::Sender<Result<SaveResult, MediaError>>,
    },
    ImageToPdf {
        src_path: String,
        dest_path: String,
        reply: mpsc::Sender<Result<ImageToPdfResult, MediaError>>,
    },
    GetPageText {
        doc_id: u64,
        page_index: u32,
        settings: TextLayerSettings,
        reply: mpsc::Sender<Result<PageTextContent, MediaError>>,
    },
    /// PoC: Add image to existing page
    AddImageToPage {
        doc_id: u64,
        page_index: u32,
        image_bytes: Vec<u8>,
        x_pt: f32,
        y_pt: f32,
        width_pt: f32,
        height_pt: f32,
        reply: mpsc::Sender<Result<AddImageResult, MediaError>>,
    },
    /// Add text to existing page as real PDF text object
    AddTextToPage {
        doc_id: u64,
        page_index: u32,
        text: String,
        x_pt: f32,
        y_pt: f32,
        font_size: f32,
        color: String,
        font_family: Option<String>,
        reply: mpsc::Sender<Result<AddImageResult, MediaError>>,
    },
}

// ============================================================================
// Result helper functions
// ============================================================================

fn make_mutation_result(record: &PdfDocRecord) -> MutationResult {
    MutationResult {
        pages: record.doc.pages().len() as usize,
        dirty: record.dirty,
        revision: record.revision,
    }
}

fn make_rotation_result(record: &PdfDocRecord, rotation_deg: u16) -> RotationResult {
    RotationResult {
        rotation_deg,
        dirty: record.dirty,
        revision: record.revision,
    }
}

// ============================================================================
// Worker initialization
// ============================================================================

pub fn init_pdf_worker(cache_dir: PathBuf) {
    let (tx, rx) = mpsc::channel::<PdfRequest>();
    *WORKER_TX.lock().unwrap() = Some(tx);
    std::thread::spawn(move || {
        use pdfium_render::prelude::*;
        let pdfium = match get_pdfium() {
            Ok(p) => p,
            Err(e) => {
                eprintln!("PDF worker init failed: {}", e.message);
                return;
            }
        };
        let mut docs: HashMap<u64, PdfDocRecord<'_>> = HashMap::new();
        let mut min_gen: HashMap<(u64, u32), u64> = HashMap::new();
        let cache_root = cache_dir.join(TEXT_CACHE_DIR_NAME);
        let glyph_cache = GlyphCache::new(&cache_root).ok();
        if glyph_cache.is_none() {
            warn!("文字框快取初始化失敗，將以非快取模式運行");
        }
        loop {
            match rx.recv() {
                Ok(PdfRequest::Open { path, reply }) => {
                    let res = (|| {
                        let document = pdfium.load_pdf_from_file(&path, None).map_err(|e| {
                            MediaError::new("parse_error", format!("開啟 PDF 失敗: {e}"))
                        })?;
                        let pages = document.pages().len() as usize;
                        let (baseline_tokens, baseline_rot, next_token) =
                            init_tokens_for_doc(&document)?;
                        let id = NEXT_DOC_ID.fetch_add(1, Ordering::SeqCst);
                        let file_meta = fs::metadata(&path).ok();
                        let record = PdfDocRecord {
                            doc: document,
                            path: path.clone(),
                            file_size: file_meta.as_ref().map(|m| m.len()),
                            file_hash: None,
                            dirty: false,
                            baseline_tokens: baseline_tokens.clone(),
                            current_tokens: baseline_tokens,
                            baseline_rot: baseline_rot.clone(),
                            current_rot: baseline_rot,
                            next_token,
                            revision: 0,
                            undo_stack: Vec::new(),
                            redo_stack: Vec::new(),
                        };
                        docs.insert(id, record);
                        Ok(PdfOpenResult {
                            doc_id: id,
                            pages,
                            dirty: false,
                            revision: 0,
                        })
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::Close { doc_id, reply }) => {
                    let _ = docs.remove(&doc_id);
                    let _ = reply.send(Ok(()));
                }
                Ok(PdfRequest::Render { args, reply }) => {
                    let res = (|| -> Result<PageRender, MediaError> {
                        let doc = docs.get(&args.doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", args.doc_id))
                        })?;
                        let g_req = args.r#gen.unwrap_or(0);
                        let key = (args.doc_id, args.page_index);
                        if let Some(g_min) = min_gen.get(&key) {
                            if g_req < *g_min {
                                return Err(MediaError::new("canceled", "render canceled"));
                            }
                        }
                        render_page_for_document(&doc.doc, &args)
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::Size {
                    doc_id,
                    page_index,
                    reply,
                }) => {
                    let res = (|| -> Result<PdfPageSize, MediaError> {
                        let doc = docs.get(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        let idx_u16: u16 = page_index.try_into().map_err(|_| {
                            MediaError::new("invalid_input", format!("頁索引過大: {}", page_index))
                        })?;
                        let page = doc.doc.pages().get(idx_u16).map_err(|_| {
                            MediaError::new("not_found", format!("頁索引不存在: {}", page_index))
                        })?;
                        Ok(PdfPageSize {
                            width_pt: page.width().value as f32,
                            height_pt: page.height().value as f32,
                        })
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::Cancel {
                    doc_id,
                    page_index,
                    min_gen: g,
                    reply,
                }) => {
                    let key = (doc_id, page_index);
                    let entry = min_gen.entry(key).or_insert(0);
                    if g > *entry {
                        *entry = g;
                    }
                    let _ = reply.send(Ok(()));
                }
                Ok(PdfRequest::ExportImage {
                    doc_id,
                    page_index,
                    dest_path,
                    format,
                    target_width,
                    dpi,
                    quality,
                    reply,
                }) => {
                    let res = (|| -> Result<(String, u32, u32, String), MediaError> {
                        let doc = docs.get(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        let fmt = match format.to_lowercase().as_str() {
                            "jpeg" | "jpg" => "jpeg",
                            _ => "png",
                        };
                        let args = PdfRenderArgs {
                            doc_id,
                            page_index,
                            scale: None,
                            dpi,
                            format: Some(fmt.to_string()),
                            target_width,
                            quality,
                            r#gen: None,
                        };
                        let page = render_page_for_document(&doc.doc, &args)?;
                        std::fs::write(&dest_path, &page.image_bytes).map_err(|e| {
                            MediaError::new("io_error", format!("寫入影像失敗: {e}"))
                        })?;
                        Ok((dest_path, page.width_px, page.height_px, page.format))
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::ExportPdf {
                    doc_id,
                    page_index,
                    dest_path,
                    reply,
                }) => {
                    let res = (|| -> Result<String, MediaError> {
                        let doc = docs.get(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        let idx_u16: u16 = page_index.try_into().map_err(|_| {
                            MediaError::new("invalid_input", format!("頁索引過大: {}", page_index))
                        })?;
                        let mut new_doc = pdfium.create_new_pdf().map_err(|e| {
                            MediaError::new("io_error", format!("建立新 PDF 失敗: {e}"))
                        })?;
                        new_doc
                            .pages_mut()
                            .copy_page_from_document(&doc.doc, idx_u16, 0)
                            .map_err(|e| {
                                MediaError::new("io_error", format!("複製頁面失敗: {e}"))
                            })?;
                        new_doc.save_to_file(&dest_path).map_err(|e| {
                            MediaError::new("io_error", format!("寫入 PDF 失敗: {e}"))
                        })?;
                        Ok(dest_path)
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::InsertBlank {
                    doc_id,
                    index,
                    width_pt,
                    height_pt,
                    reply,
                }) => {
                    let res = (|| -> Result<MutationResult, MediaError> {
                        let doc = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        insert_blank_at(doc, index, width_pt, height_pt)?;
                        push_undo(
                            doc,
                            HistoryEvent::InsertBlank {
                                index,
                                count: 1,
                                width_pt,
                                height_pt,
                            },
                        );
                        Ok(make_mutation_result(doc))
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::DeletePages {
                    doc_id,
                    mut indices,
                    reply,
                }) => {
                    let res = (|| -> Result<MutationResult, MediaError> {
                        let record = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        let page_count = record.doc.pages().len();
                        if page_count == 0 {
                            return Err(MediaError::new("invalid_input", "文件沒有任何頁面"));
                        }
                        if indices.is_empty() {
                            return Err(MediaError::new("invalid_input", "缺少要刪除的頁索引"));
                        }
                        indices.sort_unstable();
                        indices.dedup();
                        if let Some(max) = indices.last() {
                            if *max >= page_count as u32 {
                                return Err(MediaError::new(
                                    "invalid_input",
                                    format!("頁索引超出範圍: {} >= {}", max, page_count),
                                ));
                            }
                        }
                        let first = *indices
                            .first()
                            .ok_or_else(|| MediaError::new("invalid_input", "缺少要刪除的頁索引"))?;
                        let count = indices.len();
                        // Save original tokens and rotations before deletion
                        let tokens: Vec<u64> = indices.iter().map(|&i| record.current_tokens[i as usize]).collect();
                        let rotations: Vec<u16> = indices.iter().map(|&i| record.current_rot[i as usize]).collect();
                        let temp_path = capture_pages_to_temp(&pdfium, &record.doc, &indices)?;
                        delete_indices(&pdfium, record, indices)?;
                        push_undo(
                            record,
                            HistoryEvent::Delete {
                                index: first,
                                count,
                                temp_path,
                                tokens,
                                rotations,
                            },
                        );
                        Ok(make_mutation_result(record))
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::RotatePage {
                    doc_id,
                    index,
                    rotate_deg,
                    reply,
                }) => {
                    let res = (|| -> Result<RotationResult, MediaError> {
                        use pdfium_render::prelude::*;
                        let doc = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        let idx_usize: usize = index.try_into().map_err(|_| {
                            MediaError::new("invalid_input", format!("頁索引過大: {}", index))
                        })?;
                        let prev = *doc
                            .current_rot
                            .get(idx_usize)
                            .ok_or_else(|| MediaError::new("not_found", "頁索引不存在"))?;
                        let rot = match rotate_deg {
                            90 => PdfPageRenderRotation::Degrees90,
                            180 => PdfPageRenderRotation::Degrees180,
                            270 => PdfPageRenderRotation::Degrees270,
                            0 => PdfPageRenderRotation::None,
                            _ => {
                                return Err(MediaError::new(
                                    "invalid_input",
                                    "旋轉角度只接受 0|90|180|270",
                                ));
                            }
                        };
                        let idx_u16: u16 = index.try_into().map_err(|_| {
                            MediaError::new("invalid_input", format!("頁索引過大: {}", index))
                        })?;
                        {
                            let mut page = doc.doc.pages_mut().get(idx_u16).map_err(|_| {
                                MediaError::new("not_found", format!("頁索引不存在: {}", index))
                            })?;
                            page.set_rotation(rot);
                        }
                        if idx_usize >= doc.current_rot.len() {
                            return Err(MediaError::new(
                                "invalid_input",
                                "內部旋轉序列長度不一致，無法更新",
                            ));
                        }
                        doc.current_rot[idx_usize] = rotation_to_degrees(rot);
                        doc.file_hash = None;
                        doc.file_size = None;
                        doc.revision = doc.revision.saturating_add(1);
                        recompute_dirty(doc);
                        let now = doc.current_rot[idx_usize];
                        push_undo(
                            doc,
                            HistoryEvent::Rotate {
                                index,
                                from: prev,
                                to: now,
                            },
                        );
                        Ok(make_rotation_result(doc, rotation_to_degrees(rot)))
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::RotatePageRelative {
                    doc_id,
                    index,
                    delta_deg,
                    reply,
                }) => {
                    let res = (|| -> Result<RotationResult, MediaError> {
                        use pdfium_render::prelude::*;
                        let doc = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        let idx_u16: u16 = index.try_into().map_err(|_| {
                            MediaError::new("invalid_input", format!("頁索引過大: {}", index))
                        })?;
                        let idx_usize: usize = index.try_into().map_err(|_| {
                            MediaError::new("invalid_input", format!("頁索引過大: {}", index))
                        })?;
                        let prev_rot = *doc
                            .current_rot
                            .get(idx_usize)
                            .ok_or_else(|| MediaError::new("not_found", "頁索引不存在"))?;
                        let mut page = doc.doc.pages_mut().get(idx_u16).map_err(|_| {
                            MediaError::new("not_found", format!("頁索引不存在: {}", index))
                        })?;
                        let cur = page.rotation().map_err(|e| {
                            MediaError::new("io_error", format!("取得頁面旋轉失敗: {e}"))
                        })?;
                        let cur_deg: i16 = match cur {
                            PdfPageRenderRotation::None => 0,
                            PdfPageRenderRotation::Degrees90 => 90,
                            PdfPageRenderRotation::Degrees180 => 180,
                            PdfPageRenderRotation::Degrees270 => 270,
                        };
                        let add: i16 = ((delta_deg % 360) + 360) % 360;
                        let next: i16 = ((cur_deg + add) % 360 + 360) % 360;
                        let set_to = match next {
                            0 => PdfPageRenderRotation::None,
                            90 => PdfPageRenderRotation::Degrees90,
                            180 => PdfPageRenderRotation::Degrees180,
                            270 => PdfPageRenderRotation::Degrees270,
                            _ => PdfPageRenderRotation::None,
                        };
                        page.set_rotation(set_to);
                        if idx_usize >= doc.current_rot.len() {
                            return Err(MediaError::new(
                                "invalid_input",
                                "內部旋轉序列長度不一致，無法更新",
                            ));
                        }
                        doc.current_rot[idx_usize] = match set_to {
                            PdfPageRenderRotation::None => 0,
                            PdfPageRenderRotation::Degrees90 => 90,
                            PdfPageRenderRotation::Degrees180 => 180,
                            PdfPageRenderRotation::Degrees270 => 270,
                        };
                        doc.file_hash = None;
                        doc.file_size = None;
                        doc.revision = doc.revision.saturating_add(1);
                        recompute_dirty(doc);
                        let rot_deg = match set_to {
                            PdfPageRenderRotation::None => 0,
                            PdfPageRenderRotation::Degrees90 => 90,
                            PdfPageRenderRotation::Degrees180 => 180,
                            PdfPageRenderRotation::Degrees270 => 270,
                        };
                        push_undo(
                            doc,
                            HistoryEvent::Rotate {
                                index,
                                from: prev_rot,
                                to: rot_deg,
                            },
                        );
                        Ok(make_rotation_result(doc, rot_deg))
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::CopyPage {
                    src_doc_id,
                    src_index,
                    dest_doc_id,
                    dest_index,
                    reply,
                }) => {
                    let res = (|| -> Result<MutationResult, MediaError> {
                        if src_doc_id == dest_doc_id {
                            let mut record = docs.remove(&src_doc_id).ok_or_else(|| {
                                MediaError::new(
                                    "not_found",
                                    format!("未知的 docId: {}", src_doc_id),
                                )
                            })?;
                            let mut tmp = pdfium.create_new_pdf().map_err(|e| {
                                MediaError::new("io_error", format!("建立暫存 PDF 失敗: {e}"))
                            })?;
                            let idx_src_u16: u16 = src_index.try_into().map_err(|_| {
                                MediaError::new(
                                    "invalid_input",
                                    format!("頁索引過大: {}", src_index),
                                )
                            })?;
                            let idx_src_usize: usize = src_index.try_into().map_err(|_| {
                                MediaError::new(
                                    "invalid_input",
                                    format!("頁索引過大: {}", src_index),
                                )
                            })?;
                            {
                                let src_ref = &record.doc;
                                tmp.pages_mut()
                                    .copy_page_from_document(src_ref, idx_src_u16, 0)
                                    .map_err(|e| {
                                        MediaError::new("io_error", format!("複製來源頁失敗: {e}"))
                                    })?;
                            }
                            let idx_dest_u16: u16 = dest_index.try_into().map_err(|_| {
                                MediaError::new(
                                    "invalid_input",
                                    format!("頁索引過大: {}", dest_index),
                                )
                            })?;
                            let idx_dest_usize: usize = dest_index.try_into().map_err(|_| {
                                MediaError::new(
                                    "invalid_input",
                                    format!("頁索引過大: {}", dest_index),
                                )
                            })?;
                            record
                                .doc
                                .pages_mut()
                                .copy_pages_from_document(&tmp, "1", idx_dest_u16)
                                .map_err(|e| {
                                    MediaError::new("io_error", format!("插入頁面失敗: {e}"))
                                })?;
                            let rotation_for_new =
                                if let Some(rot) = record.current_rot.get(idx_src_usize) {
                                    *rot
                                } else {
                                    page_rotation_deg(&record.doc, idx_src_u16)?
                                };
                            let temp_path = {
                                let path = temp_pdf_path("copy-page");
                                tmp.save_to_file(&path).map_err(|e| {
                                    MediaError::new("io_error", format!("寫入暫存 PDF 失敗: {e}"))
                                })?;
                                path
                            };
                            if idx_dest_usize > record.current_tokens.len()
                                || idx_dest_usize > record.current_rot.len()
                            {
                                return Err(MediaError::new(
                                    "invalid_input",
                                    "內部頁序列長度不一致，無法插入",
                                ));
                            }
                            record
                                .current_tokens
                                .insert(idx_dest_usize, record.next_token);
                            record.next_token = record.next_token.saturating_add(1);
                            record.current_rot.insert(idx_dest_usize, rotation_for_new);
                            record.file_hash = None;
                            record.file_size = None;
                            record.revision = record.revision.saturating_add(1);
                            recompute_dirty(&mut record);
                            push_undo(
                                &mut record,
                                HistoryEvent::InsertFromPdf {
                                    index: dest_index,
                                    count: 1,
                                    temp_path,
                                },
                            );
                            docs.insert(src_doc_id, record);
                            let doc_ref = docs.get(&src_doc_id).ok_or_else(|| {
                                MediaError::new("not_found", "複製後無法讀取文件狀態")
                            })?;
                            Ok(make_mutation_result(doc_ref))
                        } else {
                            let mut dest = docs.remove(&dest_doc_id).ok_or_else(|| {
                                MediaError::new(
                                    "not_found",
                                    format!("未知的 docId: {}", dest_doc_id),
                                )
                            })?;
                            let src = docs.get(&src_doc_id).ok_or_else(|| {
                                MediaError::new(
                                    "not_found",
                                    format!("未知的 docId: {}", src_doc_id),
                                )
                            })?;
                            let idx_src_u16: u16 = src_index.try_into().map_err(|_| {
                                MediaError::new(
                                    "invalid_input",
                                    format!("頁索引過大: {}", src_index),
                                )
                            })?;
                            let idx_src_usize: usize = src_index.try_into().map_err(|_| {
                                MediaError::new(
                                    "invalid_input",
                                    format!("頁索引過大: {}", src_index),
                                )
                            })?;
                            let idx_dest_u16: u16 = dest_index.try_into().map_err(|_| {
                                MediaError::new(
                                    "invalid_input",
                                    format!("頁索引過大: {}", dest_index),
                                )
                            })?;
                            let idx_dest_usize: usize = dest_index.try_into().map_err(|_| {
                                MediaError::new(
                                    "invalid_input",
                                    format!("頁索引過大: {}", dest_index),
                                )
                            })?;
                            let mut tmp = pdfium.create_new_pdf().map_err(|e| {
                                MediaError::new("io_error", format!("建立暫存 PDF 失敗: {e}"))
                            })?;
                            {
                                let src_ref = &src.doc;
                                tmp.pages_mut()
                                    .copy_page_from_document(src_ref, idx_src_u16, 0)
                                    .map_err(|e| {
                                        MediaError::new("io_error", format!("複製來源頁失敗: {e}"))
                                    })?;
                            }
                            let temp_path = {
                                let path = temp_pdf_path("copy-page");
                                tmp.save_to_file(&path).map_err(|e| {
                                    MediaError::new("io_error", format!("寫入暫存 PDF 失敗: {e}"))
                                })?;
                                path
                            };
                            dest.doc
                                .pages_mut()
                                .copy_pages_from_document(&tmp, "1", idx_dest_u16)
                                .map_err(|e| {
                                    MediaError::new("io_error", format!("複製頁面失敗: {e}"))
                                })?;
                            let rotation_for_new =
                                if let Some(rot) = src.current_rot.get(idx_src_usize) {
                                    *rot
                                } else {
                                    page_rotation_deg(&src.doc, idx_src_u16)?
                                };
                            if idx_dest_usize > dest.current_tokens.len()
                                || idx_dest_usize > dest.current_rot.len()
                            {
                                return Err(MediaError::new(
                                    "invalid_input",
                                    "內部頁序列長度不一致，無法插入",
                                ));
                            }
                            dest.current_tokens.insert(idx_dest_usize, dest.next_token);
                            dest.next_token = dest.next_token.saturating_add(1);
                            dest.current_rot.insert(idx_dest_usize, rotation_for_new);
                            dest.file_hash = None;
                            dest.file_size = None;
                            dest.revision = dest.revision.saturating_add(1);
                            recompute_dirty(&mut dest);
                            push_undo(
                                &mut dest,
                                HistoryEvent::InsertFromPdf {
                                    index: dest_index,
                                    count: 1,
                                    temp_path,
                                },
                            );
                            docs.insert(dest_doc_id, dest);
                            let doc_ref = docs.get(&dest_doc_id).ok_or_else(|| {
                                MediaError::new("not_found", "複製後無法讀取目標文件狀態")
                            })?;
                            Ok(make_mutation_result(doc_ref))
                        }
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::Undo { doc_id, reply }) => {
                    let res = (|| -> Result<MutationResult, MediaError> {
                        let doc = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        let ev = doc.undo_stack.pop().ok_or_else(|| {
                            MediaError::new("invalid_input", "沒有可復原的動作")
                        })?;
                        apply_history_event(&pdfium, doc, &ev, false)?;
                        doc.redo_stack.push(ev);
                        Ok(make_mutation_result(doc))
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::Redo { doc_id, reply }) => {
                    let res = (|| -> Result<MutationResult, MediaError> {
                        let doc = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        let ev = doc.redo_stack.pop().ok_or_else(|| {
                            MediaError::new("invalid_input", "沒有可重做的動作")
                        })?;
                        apply_history_event(&pdfium, doc, &ev, true)?;
                        doc.undo_stack.push(ev);
                        Ok(make_mutation_result(doc))
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::Save {
                    doc_id,
                    dest_path,
                    overwrite,
                    reply,
                }) => {
                    let res = (|| -> Result<SaveResult, MediaError> {
                        let doc = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        let dest = match (dest_path, overwrite.unwrap_or(false)) {
                            (Some(p), ow) => {
                                if !ow && Path::new(&p).exists() {
                                    return Err(MediaError::new(
                                        "io_error",
                                        format!("目的檔已存在：{}（overwrite=false）", p),
                                    ));
                                }
                                p
                            }
                            (None, true) => doc.path.clone(),
                            _ => {
                                return Err(MediaError::new(
                                    "invalid_input",
                                    "請提供 destPath 或設定 overwrite=true 以覆蓋原檔",
                                ));
                            }
                        };
                        doc.doc.save_to_file(&dest).map_err(|e| {
                            MediaError::new("io_error", format!("寫入檔案失敗: {e}"))
                        })?;
                        doc.path = dest.clone();
                        let meta = fs::metadata(&dest).ok();
                        doc.file_size = meta.as_ref().map(|m| m.len());
                        doc.file_hash = None;
                        doc.dirty = false;
                        doc.baseline_tokens = doc.current_tokens.clone();
                        doc.baseline_rot = doc.current_rot.clone();
                        doc.undo_stack.clear();
                        doc.redo_stack.clear();
                        doc.revision = doc.revision.saturating_add(1);
                        let pages = doc.doc.pages().len() as usize;
                        Ok(SaveResult {
                            path: dest,
                            pages,
                            dirty: doc.dirty,
                            revision: doc.revision,
                        })
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::ImageToPdf {
                    src_path,
                    dest_path,
                    reply,
                }) => {
                    let res = (|| -> Result<ImageToPdfResult, MediaError> {
                        let p = Path::new(&src_path);
                        if !p.exists() {
                            return Err(MediaError::new(
                                "not_found",
                                format!("圖片檔案不存在: {}", src_path),
                            ));
                        }

                        let bytes = fs::read(p).map_err(|e| {
                            MediaError::new("io_error", format!("讀取圖片失敗: {e}"))
                        })?;
                        let dyn_img = image::load_from_memory(&bytes).map_err(|e| {
                            MediaError::new("decode_error", format!("解碼圖片失敗: {e}"))
                        })?;
                        let (w_px, h_px) = GenericImageView::dimensions(&dyn_img);

                        let dpi = image_dpi_from_bytes(&bytes);
                        let (width_pt, height_pt) = if let Some(dpi_val) = dpi {
                            let scale = 72.0 / dpi_val;
                            (
                                (w_px as f32 * scale).max(1.0),
                                (h_px as f32 * scale).max(1.0),
                            )
                        } else {
                            (w_px as f32, h_px as f32)
                        };

                        let mut doc = pdfium.create_new_pdf().map_err(|e| {
                            MediaError::new("io_error", format!("建立 PDF 失敗: {e}"))
                        })?;

                        let size = PdfPagePaperSize::Custom(
                            PdfPoints::new(width_pt),
                            PdfPoints::new(height_pt),
                        );
                        let mut page =
                            doc.pages_mut().create_page_at_index(size, 0).map_err(|e| {
                                MediaError::new("io_error", format!("建立頁面失敗: {e}"))
                            })?;

                        {
                            let objects = page.objects_mut();
                            let _obj = objects
                                .create_image_object(
                                    PdfPoints::new(0.0),
                                    PdfPoints::new(0.0),
                                    &dyn_img,
                                    Some(PdfPoints::new(width_pt)),
                                    Some(PdfPoints::new(height_pt)),
                                )
                                .map_err(|e| {
                                    MediaError::new("unsupported", format!("建立影像物件失敗: {e}"))
                                })?;
                        }

                        doc.save_to_file(&dest_path).map_err(|e| {
                            MediaError::new("io_error", format!("寫入 PDF 失敗: {e}"))
                        })?;
                        Ok(ImageToPdfResult {
                            path: dest_path,
                            width_pt,
                            height_pt,
                        })
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::GetPageText {
                    doc_id,
                    page_index,
                    settings,
                    reply,
                }) => {
                    let res = (|| -> Result<PageTextContent, MediaError> {
                        use pdfium_render::prelude::PdfPageTextChar;

                        fn char_geometry(
                            ch: &PdfPageTextChar,
                            global_offset_x: f32,
                            global_offset_y: f32,
                        ) -> Option<(f32, f32, f32, f32)> {
                            if let Ok(b) = ch.tight_bounds() {
                                let x = b.left().value as f32 + global_offset_x;
                                let y = b.bottom().value as f32 - global_offset_y;
                                let w = b.width().value as f32;
                                let h = b.height().value as f32;
                                return Some((x, y, w, h));
                            }

                            if let Ok(b) = ch.loose_bounds() {
                                let x = b.left().value as f32 + global_offset_x;
                                let y = b.bottom().value as f32 - global_offset_y;
                                let w = b.width().value as f32;
                                let h = b.height().value as f32;
                                return Some((x, y, w, h));
                            }

                            None
                        }

                        let doc = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;

                        if doc.file_size.is_none() {
                            doc.file_size = fs::metadata(&doc.path).ok().map(|m| m.len());
                        }
                        let cache_allowed = !doc.dirty;
                        let file_size_for_cache = doc.file_size;
                        let file_hash_for_cache = if cache_allowed {
                            if doc.file_hash.is_none() {
                                doc.file_hash = compute_file_hash(&doc.path);
                            }
                            doc.file_hash.clone()
                        } else {
                            None
                        };

                        let idx_u16: u16 = page_index.try_into().map_err(|_| {
                            MediaError::new("invalid_input", format!("頁索引過大: {}", page_index))
                        })?;
                        let page = doc.doc.pages().get(idx_u16).map_err(|_| {
                            MediaError::new("not_found", format!("頁索引不存在: {}", page_index))
                        })?;

                        let rotation = page.rotation().map_err(|e| {
                            MediaError::new("io_error", format!("取得頁面旋轉失敗: {e}"))
                        })?;
                        let rotation_deg = rotation_to_degrees(rotation);

                        let cache_key = if cache_allowed {
                            if let (Some(hash), Some(size)) =
                                (file_hash_for_cache, file_size_for_cache)
                            {
                                Some(CacheKey {
                                    file_hash: hash,
                                    file_size: size,
                                    page_index,
                                    rotation_deg,
                                    extractor_version: TEXT_EXTRACTOR_VERSION,
                                })
                            } else {
                                None
                            }
                        } else {
                            None
                        };

                        if let (Some(cache), Some(key)) = (glyph_cache.as_ref(), cache_key.as_ref())
                        {
                            if let Some(hit) = cache.get(key) {
                                return Ok(hit);
                            }
                        }

                        let width_pt = page.width().value as f32;
                        let height_pt = page.height().value as f32;

                        let (orig_width, orig_height) = match rotation_deg {
                            90 | 270 => (height_pt, width_pt),
                            _ => (width_pt, height_pt),
                        };

                        let text_page = page.text().map_err(|e| {
                            MediaError::new("parse_error", format!("無法提取文字: {e}"))
                        })?;

                        let overlap_threshold = settings.overlap_threshold.unwrap_or(0.0);
                        let min_spacing = settings.min_spacing.unwrap_or(1.0);
                        let small_gap_threshold = settings.small_gap_threshold.unwrap_or(0.5);
                        let small_gap_spacing = settings.small_gap_spacing.unwrap_or(0.5);
                        let global_offset_x = settings.global_offset_x.unwrap_or(0.0);
                        let global_offset_y = settings.global_offset_y.unwrap_or(0.0);

                        let char_count = text_page.chars().len();
                        let mut spans: Vec<TextSpan> = Vec::with_capacity(char_count / 5);
                        let mut current_span: Option<TextSpan> = None;
                        let mut prev_x_end: Option<f32> = None;
                        let mut prev_y: Option<f32> = None;
                        let mut prev_height: Option<f32> = None;
                        let mut prev_char: Option<char> = None;

                        let mut running_height_sum: f32 = 0.0;
                        let mut running_height_count: usize = 0;

                        let span_break_factor = 0.3_f32;

                        for i in 0..char_count {
                            if let Ok(text_char) = text_page.chars().get(i) {
                                if let Some(text_ch) = text_char.unicode_char() {
                                    if let Some((raw_x, raw_y, raw_width, raw_height)) =
                                        char_geometry(&text_char, global_offset_x, global_offset_y)
                                    {
                                        let (mut x, y, mut width, mut height) = match rotation_deg {
                                            90 => {
                                                (
                                                    raw_y,
                                                    orig_width - raw_x - raw_width,
                                                    raw_height,
                                                    raw_width,
                                                )
                                            }
                                            180 => {
                                                (
                                                    orig_width - raw_x - raw_width,
                                                    orig_height - raw_y - raw_height,
                                                    raw_width,
                                                    raw_height,
                                                )
                                            }
                                            270 => {
                                                (
                                                    orig_height - raw_y - raw_height,
                                                    raw_x,
                                                    raw_height,
                                                    raw_width,
                                                )
                                            }
                                            _ => (raw_x, raw_y, raw_width, raw_height),
                                        };

                                        if height > 0.1 && height < 1000.0 {
                                            running_height_sum += height;
                                            running_height_count += 1;
                                        }

                                        let em_baseline = if running_height_count > 10 {
                                            running_height_sum / running_height_count as f32
                                        } else {
                                            height.max(1.0)
                                        };

                                        if width < 0.2 * em_baseline || width > 3.0 * em_baseline {
                                            width = em_baseline;
                                        }
                                        if height < 0.2 * em_baseline || height > 3.0 * em_baseline
                                        {
                                            height = em_baseline;
                                        }

                                        if let (Some(prev_end), Some(prev_y_val), Some(prev_h)) =
                                            (prev_x_end, prev_y, prev_height)
                                        {
                                            let avg_h = (height + prev_h) * 0.5;
                                            let line_threshold = avg_h * 0.6;

                                            if (y - prev_y_val).abs() < line_threshold {
                                                let gap = x - prev_end;
                                                let original_x_end = x + width;

                                                if gap < overlap_threshold {
                                                    let new_x = prev_end + min_spacing;

                                                    width = (original_x_end - new_x)
                                                        .max(width * 0.5)
                                                        .max(1.0);
                                                    x = new_x;
                                                } else if gap < small_gap_threshold
                                                    && text_ch != ' '
                                                {
                                                    let new_x = prev_end + small_gap_spacing;

                                                    width = (original_x_end - new_x)
                                                        .max(width * 0.5)
                                                        .max(1.0);
                                                    x = new_x;
                                                }
                                            }
                                        }

                                        prev_x_end = Some(x + width);
                                        prev_y = Some(y);
                                        prev_height = Some(height);

                                        let mut should_break = true;
                                        let prev_char_val = prev_char;
                                        let is_current_whitespace = text_ch.is_whitespace();
                                        let prev_is_whitespace = prev_char_val
                                            .map(|c| c.is_whitespace())
                                            .unwrap_or(true);

                                        if let Some(ref mut curr) = current_span {
                                            let same_line =
                                                (y - curr.y).abs() < (curr.height * 0.5);

                                            if same_line {
                                                let expected_x = curr.x + curr.width;
                                                let gap = x - expected_x;

                                                let gap_threshold = curr.height * span_break_factor;
                                                let within_normal_gap = gap < gap_threshold
                                                    && gap > -(curr.height * 0.15);
                                                let is_word_continuation =
                                                    !is_current_whitespace && !prev_is_whitespace;
                                                let relaxed_gap_limit = curr.height * 0.65;

                                                if within_normal_gap
                                                    || (is_word_continuation
                                                        && gap >= gap_threshold
                                                        && gap <= relaxed_gap_limit)
                                                {
                                                    should_break = false;

                                                    curr.text.push(text_ch);
                                                    curr.width = (x + width) - curr.x;
                                                    curr.height = curr.height.max(height);
                                                }
                                            }
                                        }

                                        if should_break {
                                            if let Some(finished_span) = current_span.take() {
                                                spans.push(finished_span);
                                            }

                                            current_span = Some(TextSpan {
                                                text: text_ch.to_string(),
                                                x,
                                                y,
                                                width,
                                                height,
                                            });
                                        }

                                        prev_char = Some(text_ch);
                                    }
                                }
                            }
                        }

                        if let Some(last_span) = current_span {
                            spans.push(last_span);
                        }

                        let content = PageTextContent {
                            page_index,
                            spans,
                            width_pt,
                            height_pt,
                        };

                        if let (Some(cache), Some(key)) = (glyph_cache.as_ref(), cache_key.as_ref())
                        {
                            let _ = cache.put(key, &content);
                        }

                        Ok(content)
                    })();
                    let _ = reply.send(res);
                }
                // PoC: Add image to existing page
                Ok(PdfRequest::AddImageToPage {
                    doc_id,
                    page_index,
                    image_bytes,
                    x_pt,
                    y_pt,
                    width_pt,
                    height_pt,
                    reply,
                }) => {
                    let res = (|| -> Result<AddImageResult, MediaError> {
                        let record = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("文件 ID 不存在: {}", doc_id))
                        })?;

                        let page_count = record.doc.pages().len();
                        if page_index as u16 >= page_count {
                            return Err(MediaError::new(
                                "not_found",
                                format!("頁索引超出範圍: {} >= {}", page_index, page_count),
                            ));
                        }

                        // Decode image
                        let dyn_img = image::load_from_memory(&image_bytes).map_err(|e| {
                            MediaError::new("decode_error", format!("解碼圖片失敗: {e}"))
                        })?;

                        // Get mutable page reference
                        let idx_u16: u16 = page_index.try_into().map_err(|_| {
                            MediaError::new("invalid_input", format!("頁索引過大: {}", page_index))
                        })?;
                        let mut page = record.doc.pages_mut().get(idx_u16).map_err(|_| {
                            MediaError::new("not_found", format!("頁索引不存在: {}", page_index))
                        })?;

                        // Create and add image object
                        {
                            use pdfium_render::prelude::PdfPoints;
                            let objects = page.objects_mut();
                            let _obj = objects
                                .create_image_object(
                                    PdfPoints::new(x_pt),
                                    PdfPoints::new(y_pt),
                                    &dyn_img,
                                    Some(PdfPoints::new(width_pt)),
                                    Some(PdfPoints::new(height_pt)),
                                )
                                .map_err(|e| {
                                    MediaError::new(
                                        "unsupported",
                                        format!("建立影像物件失敗: {e}"),
                                    )
                                })?;
                        }

                        // Mark document as dirty
                        record.dirty = true;
                        record.revision += 1;

                        Ok(AddImageResult {
                            dirty: record.dirty,
                            revision: record.revision,
                        })
                    })();
                    let _ = reply.send(res);
                }
                // Add text to existing page as real PDF text object
                Ok(PdfRequest::AddTextToPage {
                    doc_id,
                    page_index,
                    text,
                    x_pt,
                    y_pt,
                    font_size,
                    color,
                    font_family,
                    reply,
                }) => {
                    let res = (|| -> Result<AddImageResult, MediaError> {
                        use pdfium_render::prelude::*;

                        let record = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("文件 ID 不存在: {}", doc_id))
                        })?;

                        let page_count = record.doc.pages().len();
                        if page_index as u16 >= page_count {
                            return Err(MediaError::new(
                                "not_found",
                                format!("頁索引超出範圍: {} >= {}", page_index, page_count),
                            ));
                        }

                        // Parse hex color to RGB
                        let color_str = color.trim_start_matches('#');
                        let r = u8::from_str_radix(&color_str[0..2], 16).unwrap_or(0);
                        let g = u8::from_str_radix(&color_str[2..4], 16).unwrap_or(0);
                        let b = u8::from_str_radix(&color_str[4..6], 16).unwrap_or(0);

                        let idx_u16: u16 = page_index.try_into().map_err(|_| {
                            MediaError::new("invalid_input", format!("頁索引過大: {}", page_index))
                        })?;

                        // Get font based on font_family
                        let font = if let Some(ref family) = font_family {
                            match family.as_str() {
                                "Helvetica" | "" => record.doc.fonts_mut().helvetica(),
                                "Times" | "Times-Roman" | "Times New Roman" => {
                                    record.doc.fonts_mut().times_roman()
                                }
                                "Courier" | "Courier New" => record.doc.fonts_mut().courier(),
                                _ => {
                                    // Try loading system font, fallback to Helvetica on failure
                                    match crate::font::load_font_data(family) {
                                        Ok(font_data) => record
                                            .doc
                                            .fonts_mut()
                                            .load_true_type_from_bytes(&font_data, true)
                                            .unwrap_or_else(|_| {
                                                record.doc.fonts_mut().helvetica()
                                            }),
                                        Err(_) => record.doc.fonts_mut().helvetica(),
                                    }
                                }
                            }
                        } else {
                            record.doc.fonts_mut().helvetica()
                        };

                        // Create text object
                        let mut text_obj = PdfPageTextObject::new(
                            &record.doc,
                            &text,
                            font,
                            PdfPoints::new(font_size),
                        )
                        .map_err(|e| {
                            MediaError::new("unsupported", format!("建立文字物件失敗: {e}"))
                        })?;

                        // Set fill color
                        text_obj
                            .set_fill_color(PdfColor::new(r, g, b, 255))
                            .map_err(|e| {
                                MediaError::new("unsupported", format!("設定文字顏色失敗: {e}"))
                            })?;

                        // y_pt is already in PDF coordinates (origin at bottom-left)
                        // Subtract font_size to position text baseline correctly
                        text_obj
                            .translate(PdfPoints::new(x_pt), PdfPoints::new(y_pt - font_size))
                            .map_err(|e| {
                                MediaError::new("unsupported", format!("設定文字位置失敗: {e}"))
                            })?;

                        // Add to page
                        let mut page = record.doc.pages_mut().get(idx_u16).map_err(|_| {
                            MediaError::new("not_found", format!("頁索引不存在: {}", page_index))
                        })?;
                        page.objects_mut().add_text_object(text_obj).map_err(|e| {
                            MediaError::new("unsupported", format!("添加文字物件失敗: {e}"))
                        })?;

                        // Mark document as dirty
                        record.dirty = true;
                        record.revision += 1;

                        Ok(AddImageResult {
                            dirty: record.dirty,
                            revision: record.revision,
                        })
                    })();
                    let _ = reply.send(res);
                }
                Err(_) => break,
            }
        }
    });
}
