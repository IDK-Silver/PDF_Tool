use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, atomic::{AtomicU64, Ordering}, mpsc};
use once_cell::sync::Lazy;
use image::ImageEncoder;
use std::fs;
use std::path::{Path, PathBuf};
// no timestamp usage currently

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct MediaError {
    pub code: String,
    pub message: String,
}

impl MediaError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self { code: code.to_string(), message: message.into() }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MediaType {
    Pdf,
    Image,
    Unknown,
}

#[derive(Serialize)]
pub struct MediaDescriptor {
    pub path: String,
    #[serde(rename = "type")]
    pub kind: MediaType,
    pub name: String,
    pub size: Option<u64>,
    pub pages: Option<usize>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub orientation: Option<u8>,
}

// Removed PdfInfo and pdf_info(): use pdf_open() result and pdf_page_size() instead.

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageRender {
    pub page_index: u32,
    pub width_px: u32,
    pub height_px: u32,
    pub scale: Option<f32>,
    pub dpi: Option<f32>,
    pub format: String,
    pub image_bytes: Vec<u8>,
}

fn infer_media_type(path: &Path) -> MediaType {
    match path.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase()) {
        Some(ext) if matches!(ext.as_str(), "pdf") => MediaType::Pdf,
        Some(ext) if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "tiff" | "tif") => MediaType::Image,
        _ => MediaType::Unknown,
    }
}

fn file_name(path: &Path) -> String {
    path.file_name().and_then(|s| s.to_str()).unwrap_or_default().to_string()
}

fn try_stat_size(path: &Path) -> Option<u64> {
    fs::metadata(path).ok().map(|m| m.len())
}

// Attempts to resolve a directory that contains the Pdfium library for the current platform.
// Strategy:
// 1) TAURI_RESOURCES_DIR env var
// 2) Resources next to the executable (macOS app bundle: ../Resources)
// 3) Development-time relative path: ./src-tauri/resources
fn resolve_pdfium_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("TAURI_RESOURCES_DIR") {
        let p = PathBuf::from(dir);
        if p.exists() { return Some(p); }
    }
    if let Ok(exe) = std::env::current_exe() {
        let exe_dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
        // macOS .app bundle: .../Contents/MacOS/<exe>; resources at ../Resources
        let mac = exe_dir.join("../Resources");
        if mac.exists() { return Some(mac.canonicalize().unwrap_or(mac)); }
        // Generic dev fallback: two levels up resources/
        let dev = exe_dir.join("../../resources");
        if dev.exists() { return Some(dev.canonicalize().unwrap_or(dev)); }
    }
    // As a last resort, current_dir/src-tauri/resources
    if let Ok(cwd) = std::env::current_dir() {
        let dev = cwd.join("src-tauri/resources");
        if dev.exists() { return Some(dev); }
    }
    None
}

fn get_pdfium() -> Result<pdfium_render::prelude::Pdfium, MediaError> {
    use pdfium_render::prelude::*;

    let Some(res_dir) = resolve_pdfium_dir() else {
        return Err(MediaError::new(
            "not_found",
            "找不到 PDFium 動態庫，請先執行 npm run pdfium:fetch 並重新啟動應用。",
        ));
    };

    // Try each platform subdir under resources/pdfium/
    let base = res_dir.join("pdfium");
    let mut tried: Vec<String> = Vec::new();

    if let Ok(entries) = fs::read_dir(&base) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let dir = entry.path();
                let lib_path = Pdfium::pdfium_platform_library_name_at_path(&dir);
                tried.push(lib_path.to_string_lossy().into_owned());
                if lib_path.exists() {
                    return Pdfium::bind_to_library(&lib_path)
                        .map(Pdfium::new)
                        .map_err(|e| MediaError::new("parse_error", format!("PDFium 載入失敗: {e}")));
                }
            }
        }
    }

    Err(MediaError::new(
        "not_found",
        format!("未能定位 PDFium 動態庫，嘗試的路徑: {tried:?}"),
    ))
}

// 單執行緒 Worker：長駐 Pdfium 與 PdfDocument（避免跨執行緒 Send/Sync 問題）
static WORKER_TX: Lazy<Mutex<Option<mpsc::Sender<PdfRequest>>>> = Lazy::new(|| Mutex::new(None));
static NEXT_DOC_ID: AtomicU64 = AtomicU64::new(1);

enum PdfRequest {
    Open { path: String, reply: mpsc::Sender<Result<PdfOpenResult, MediaError>> },
    Close { doc_id: u64, reply: mpsc::Sender<Result<(), MediaError>> },
    Render { args: PdfRenderArgs, reply: mpsc::Sender<Result<PageRender, MediaError>> },
    Size { doc_id: u64, page_index: u32, reply: mpsc::Sender<Result<PdfPageSize, MediaError>> },
    Cancel { doc_id: u64, page_index: u32, min_gen: u64, reply: mpsc::Sender<Result<(), MediaError>> },
    ExportImage { doc_id: u64, page_index: u32, dest_path: String, format: String, target_width: Option<u32>, dpi: Option<f32>, quality: Option<u8>, reply: mpsc::Sender<Result<(String, u32, u32, String), MediaError>> },
    ExportPdf { doc_id: u64, page_index: u32, dest_path: String, reply: mpsc::Sender<Result<String, MediaError>> },
    InsertBlank { doc_id: u64, index: u32, width_pt: f32, height_pt: f32, reply: mpsc::Sender<Result<usize, MediaError>> },
    DeletePages { doc_id: u64, indices: Vec<u32>, reply: mpsc::Sender<Result<usize, MediaError>> },
    RotatePage { doc_id: u64, index: u32, rotate_deg: u16, reply: mpsc::Sender<Result<(), MediaError>> },
    RotatePageRelative { doc_id: u64, index: u32, delta_deg: i16, reply: mpsc::Sender<Result<u16, MediaError>> },
    CopyPage { src_doc_id: u64, src_index: u32, dest_doc_id: u64, dest_index: u32, reply: mpsc::Sender<Result<usize, MediaError>> },
    Save { doc_id: u64, dest_path: Option<String>, overwrite: Option<bool>, reply: mpsc::Sender<Result<(String, usize), MediaError>> },
}

pub fn init_pdf_worker() {
    let (tx, rx) = mpsc::channel::<PdfRequest>();
    *WORKER_TX.lock().unwrap() = Some(tx);
    std::thread::spawn(move || {
        use pdfium_render::prelude::*;
        let pdfium = match get_pdfium() {
            Ok(p) => p,
            Err(e) => {
                // 無法載入 PDFium，工作執行緒退場
                eprintln!("PDF worker init failed: {}", e.message);
                return;
            }
        };
        let mut docs: HashMap<u64, PdfDocument> = HashMap::new();
        let mut paths: HashMap<u64, String> = HashMap::new();
        // 最小允許世代：小於此值的渲染將被立刻忽略（最佳努力取消）
        let mut min_gen: HashMap<(u64, u32), u64> = HashMap::new();
        loop {
            match rx.recv() {
                Ok(PdfRequest::Open { path, reply }) => {
                    let res = (|| {
                        let document = pdfium
                            .load_pdf_from_file(&path, None)
                            .map_err(|e| MediaError::new("parse_error", format!("開啟 PDF 失敗: {e}")))?;
                        let pages = document.pages().len() as usize;
                        let id = NEXT_DOC_ID.fetch_add(1, Ordering::SeqCst);
                        docs.insert(id, document);
                        paths.insert(id, path);
                        Ok(PdfOpenResult { doc_id: id, pages })
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::Close { doc_id, reply }) => {
                    let _ = docs.remove(&doc_id);
                    let _ = paths.remove(&doc_id);
                    let _ = reply.send(Ok(()));
                }
                Ok(PdfRequest::Render { args, reply }) => {
                    let res = (|| -> Result<PageRender, MediaError> {
                        let doc = docs.get(&args.doc_id).ok_or_else(|| MediaError::new("not_found", format!("未知的 docId: {}", args.doc_id)))?;
                        // best-effort 取消：若 gen 比 min_gen 小則直接丟棄
                        let g_req = args.r#gen.unwrap_or(0);
                        let key = (args.doc_id, args.page_index);
                        if let Some(g_min) = min_gen.get(&key) {
                            if g_req < *g_min {
                                return Err(MediaError::new("canceled", "render canceled"));
                            }
                        }
                        render_page_for_document(doc, &args)
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::Size { doc_id, page_index, reply }) => {
                    let res = (|| -> Result<PdfPageSize, MediaError> {
                        let doc = docs.get(&doc_id).ok_or_else(|| MediaError::new("not_found", format!("未知的 docId: {}", doc_id)))?;
                        use pdfium_render::prelude::*;
                        let idx_u16: u16 = page_index
                            .try_into()
                            .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", page_index)))?;
                        let page = doc.pages().get(idx_u16).map_err(|_| MediaError::new("not_found", format!("頁索引不存在: {}", page_index)))?;
                        Ok(PdfPageSize { width_pt: page.width().value as f32, height_pt: page.height().value as f32 })
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::Cancel { doc_id, page_index, min_gen: g, reply }) => {
                    let key = (doc_id, page_index);
                    let entry = min_gen.entry(key).or_insert(0);
                    if g > *entry { *entry = g; }
                    let _ = reply.send(Ok(()));
                }
                Ok(PdfRequest::ExportImage { doc_id, page_index, dest_path, format, target_width, dpi, quality, reply }) => {
                    let res = (|| -> Result<(String, u32, u32, String), MediaError> {
                        let doc = docs.get(&doc_id).ok_or_else(|| MediaError::new("not_found", format!("未知的 docId: {}", doc_id)))?;
                        let fmt = match format.to_lowercase().as_str() { "jpeg" | "jpg" => "jpeg", _ => "png" };
                        let args = PdfRenderArgs { doc_id, page_index, scale: None, dpi, format: Some(fmt.to_string()), target_width, quality, r#gen: None };
                        let page = render_page_for_document(doc, &args)?;
                        std::fs::write(&dest_path, &page.image_bytes).map_err(|e| MediaError::new("io_error", format!("寫入影像失敗: {e}")))?;
                        Ok((dest_path, page.width_px, page.height_px, page.format))
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::ExportPdf { doc_id, page_index, dest_path, reply }) => {
                    let res = (|| -> Result<String, MediaError> {
                        use pdfium_render::prelude::*;
                        let doc = docs.get(&doc_id).ok_or_else(|| MediaError::new("not_found", format!("未知的 docId: {}", doc_id)))?;
                        let idx_u16: u16 = page_index.try_into().map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", page_index)))?;
                        // 建立新 PDF 並以向量方式複製該頁，不變更原文件
                        let mut new_doc = pdfium.create_new_pdf().map_err(|e| MediaError::new("io_error", format!("建立新 PDF 失敗: {e}")))?;
                        new_doc.pages_mut().copy_page_from_document(doc, idx_u16, 0)
                            .map_err(|e| MediaError::new("io_error", format!("複製頁面失敗: {e}")))?;
                        new_doc.save_to_file(&dest_path).map_err(|e| MediaError::new("io_error", format!("寫入 PDF 失敗: {e}")))?;
                        Ok(dest_path)
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::InsertBlank { doc_id, index, width_pt, height_pt, reply }) => {
                    let res = (|| -> Result<usize, MediaError> {
                        let doc = docs.get_mut(&doc_id).ok_or_else(|| MediaError::new("not_found", format!("未知的 docId: {}", doc_id)))?;
                        let size = PdfPagePaperSize::Custom(PdfPoints::new(width_pt), PdfPoints::new(height_pt));
                        let idx_u16: u16 = index.try_into().map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", index)))?;
                        doc.pages_mut().create_page_at_index(size, idx_u16)
                            .map_err(|e| MediaError::new("io_error", format!("插入空白頁失敗: {e}")))?;
                        Ok(doc.pages().len() as usize)
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::DeletePages { doc_id, mut indices, reply }) => {
                    let res = (|| -> Result<usize, MediaError> {
                        // 取出文件所有權以避免與 HashMap 的借用衝突
                        let old = docs.remove(&doc_id).ok_or_else(|| MediaError::new("not_found", format!("未知的 docId: {}", doc_id)))?;
                        let page_count = old.pages().len();
                        if page_count == 0 { return Err(MediaError::new("invalid_input", "文件沒有任何頁面")); }
                        if indices.is_empty() { return Err(MediaError::new("invalid_input", "缺少要刪除的頁索引")); }
                        indices.sort_unstable();
                        indices.dedup();
                        if let Some(max) = indices.last() { if *max >= page_count as u32 { return Err(MediaError::new("invalid_input", format!("頁索引超出範圍: {} >= {}", max, page_count))); } }
                        // 構建保留頁碼 spec（1-based, e.g. "1,3,5-7"）
                        let mut keep: Vec<u32> = (0..(page_count as u32)).collect();
                        let del: HashSet<u32> = indices.into_iter().collect();
                        keep.retain(|i| !del.contains(i));
                        if keep.is_empty() { return Err(MediaError::new("invalid_input", "無法刪除所有頁面，至少需保留一頁")); }
                        let mut pages_1: Vec<u32> = keep.into_iter().map(|i| i + 1).collect();
                        pages_1.sort_unstable();
                        let mut ranges: Vec<(u32,u32)> = Vec::new();
                        for p in pages_1 {
                            if let Some(last) = ranges.last_mut() { if p == last.1 + 1 { last.1 = p; continue; } }
                            ranges.push((p,p));
                        }
                        let mut spec = String::new();
                        for (i,(a,b)) in ranges.iter().enumerate() {
                            if i>0 { spec.push(','); }
                            if a==b { spec.push_str(&format!("{}", a)); } else { spec.push_str(&format!("{}-{}", a, b)); }
                        }
                        let mut new_doc = pdfium.create_new_pdf().map_err(|e| MediaError::new("io_error", format!("建立新 PDF 失敗: {e}")))?;
                        new_doc.pages_mut().copy_pages_from_document(&old, &spec, 0)
                            .map_err(|e| MediaError::new("io_error", format!("複製頁面失敗: {e}")))?;
                        let pages_after = new_doc.pages().len() as usize;
                        // 替換文件
                        docs.insert(doc_id, new_doc);
                        Ok(pages_after)
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::RotatePage { doc_id, index, rotate_deg, reply }) => {
                    let res = (|| -> Result<(), MediaError> {
                        use pdfium_render::prelude::*;
                        let doc = docs.get_mut(&doc_id).ok_or_else(|| MediaError::new("not_found", format!("未知的 docId: {}", doc_id)))?;
                        let rot = match rotate_deg { 90 => PdfPageRenderRotation::Degrees90, 180 => PdfPageRenderRotation::Degrees180, 270 => PdfPageRenderRotation::Degrees270, 0 => PdfPageRenderRotation::None, _ => return Err(MediaError::new("invalid_input", "旋轉角度只接受 0|90|180|270")) };
                        let idx_u16: u16 = index.try_into().map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", index)))?;
                        let mut page = doc.pages_mut().get(idx_u16)
                            .map_err(|_| MediaError::new("not_found", format!("頁索引不存在: {}", index)))?;
                        page.set_rotation(rot);
                        Ok(())
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::RotatePageRelative { doc_id, index, delta_deg, reply }) => {
                    let res = (|| -> Result<u16, MediaError> {
                        use pdfium_render::prelude::*;
                        let doc = docs.get_mut(&doc_id).ok_or_else(|| MediaError::new("not_found", format!("未知的 docId: {}", doc_id)))?;
                        let idx_u16: u16 = index.try_into().map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", index)))?;
                        let mut page = doc.pages_mut().get(idx_u16)
                            .map_err(|_| MediaError::new("not_found", format!("頁索引不存在: {}", index)))?;
                        let cur = page.rotation().map_err(|e| MediaError::new("io_error", format!("取得頁面旋轉失敗: {e}")))?;
                        let cur_deg: i16 = match cur { PdfPageRenderRotation::None => 0, PdfPageRenderRotation::Degrees90 => 90, PdfPageRenderRotation::Degrees180 => 180, PdfPageRenderRotation::Degrees270 => 270 };
                        // 規範到 0/90/180/270
                        let add: i16 = ((delta_deg % 360) + 360) % 360;
                        let next: i16 = ((cur_deg + add) % 360 + 360) % 360;
                        let set_to = match next { 0 => PdfPageRenderRotation::None, 90 => PdfPageRenderRotation::Degrees90, 180 => PdfPageRenderRotation::Degrees180, 270 => PdfPageRenderRotation::Degrees270, _ => PdfPageRenderRotation::None };
                        page.set_rotation(set_to);
                        Ok(match set_to { PdfPageRenderRotation::None => 0, PdfPageRenderRotation::Degrees90 => 90, PdfPageRenderRotation::Degrees180 => 180, PdfPageRenderRotation::Degrees270 => 270 })
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::CopyPage { src_doc_id, src_index, dest_doc_id, dest_index, reply }) => {
                    let res = (|| -> Result<usize, MediaError> {
                        use pdfium_render::prelude::*;
                        if src_doc_id == dest_doc_id {
                            // 同文件複製：先取出文件所有權，避免 HashMap 借用衝突
                            let mut doc = docs.remove(&src_doc_id).ok_or_else(|| MediaError::new("not_found", format!("未知的 docId: {}", src_doc_id)))?;
                            // 用暫存文件承接來源頁，避免同時 &mut 與 & 的借用衝突
                            let mut tmp = pdfium.create_new_pdf().map_err(|e| MediaError::new("io_error", format!("建立暫存 PDF 失敗: {e}")))?;
                            let idx_src_u16: u16 = src_index.try_into().map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", src_index)))?;
                            {
                                let src_ref = &doc;
                                tmp.pages_mut().copy_page_from_document(src_ref, idx_src_u16, 0)
                                    .map_err(|e| MediaError::new("io_error", format!("複製來源頁失敗: {e}")))?;
                            }
                            let idx_dest_u16: u16 = dest_index.try_into().map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", dest_index)))?;
                            doc.pages_mut().copy_pages_from_document(&tmp, "1", idx_dest_u16)
                                .map_err(|e| MediaError::new("io_error", format!("插入頁面失敗: {e}")))?;
                            let pages_after = doc.pages().len() as usize;
                            docs.insert(src_doc_id, doc);
                            Ok(pages_after)
                        } else {
                            // 跨文件：先取出目標文件以避免與來源借用衝突
                            let mut dest = docs.remove(&dest_doc_id).ok_or_else(|| MediaError::new("not_found", format!("未知的 docId: {}", dest_doc_id)))?;
                            let src = docs.get(&src_doc_id).ok_or_else(|| MediaError::new("not_found", format!("未知的 docId: {}", src_doc_id)))?;
                            let idx_src_u16: u16 = src_index.try_into().map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", src_index)))?;
                            let idx_dest_u16: u16 = dest_index.try_into().map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", dest_index)))?;
                            dest.pages_mut().copy_page_from_document(src, idx_src_u16, idx_dest_u16)
                                .map_err(|e| MediaError::new("io_error", format!("複製頁面失敗: {e}")))?;
                            let pages_after = dest.pages().len() as usize;
                            docs.insert(dest_doc_id, dest);
                            Ok(pages_after)
                        }
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::Save { doc_id, dest_path, overwrite, reply }) => {
                    let res = (|| -> Result<(String, usize), MediaError> {
                        let dest = match (dest_path, overwrite.unwrap_or(false)) {
                            (Some(p), ow) => {
                                if !ow && Path::new(&p).exists() {
                                    return Err(MediaError::new("io_error", format!("目的檔已存在：{}（overwrite=false）", p)));
                                }
                                p
                            },
                            (None, true) => {
                                paths.get(&doc_id).cloned().ok_or_else(|| MediaError::new("invalid_input", "未提供 destPath，且無可覆蓋之原始路徑"))?
                            },
                            _ => return Err(MediaError::new("invalid_input", "請提供 destPath 或設定 overwrite=true 以覆蓋原檔")),
                        };
                        let doc = docs.get(&doc_id).ok_or_else(|| MediaError::new("not_found", format!("未知的 docId: {}", doc_id)))?;
                        doc.save_to_file(&dest).map_err(|e| MediaError::new("io_error", format!("寫入檔案失敗: {e}")))?;
                        paths.insert(doc_id, dest.clone());
                        let pages = doc.pages().len() as usize;
                        Ok((dest, pages))
                    })();
                    let _ = reply.send(res);
                }
                Err(_) => break,
            }
        }
    });
}

#[tauri::command]
pub fn analyze_media(path: String) -> Result<MediaDescriptor, MediaError> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(MediaError::new("not_found", format!("檔案不存在: {}", path)));
    }
    let kind = infer_media_type(p);
    let name = file_name(p);
    let size = try_stat_size(p);

    let desc = MediaDescriptor {
        path,
        kind,
        name,
        size,
        pages: None,
        width: None,
        height: None,
        orientation: None,
    };
    Ok(desc)
}

// 移除 pdf_info：請改用 pdf_open 的回傳或 pdf_page_size。

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOpenResult { pub doc_id: u64, pub pages: usize }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPageSize { pub width_pt: f32, pub height_pt: f32 }

#[tauri::command]
pub fn pdf_open(path: String) -> Result<PdfOpenResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Open { path, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_close(doc_id: u64) -> Result<(), MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Close { doc_id, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_page_size(doc_id: u64, page_index: u32) -> Result<PdfPageSize, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Size { doc_id, page_index, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfRenderArgs {
    pub doc_id: u64,
    #[serde(alias = "page_index")]
    pub page_index: u32,
    pub scale: Option<f32>,
    pub dpi: Option<f32>,
    pub format: Option<String>,
    pub target_width: Option<u32>,
    pub quality: Option<u8>,
    #[serde(alias = "gen")]
    pub r#gen: Option<u64>,
}

#[tauri::command]
pub fn pdf_render_page(args: PdfRenderArgs) -> Result<PageRender, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Render { args, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_render_cancel(doc_id: u64, page_index: u32, min_gen: u64) -> Result<(), MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Cancel { doc_id, page_index, min_gen, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

fn render_page_for_document(
    document: &pdfium_render::prelude::PdfDocument,
    args: &PdfRenderArgs,
) -> Result<PageRender, MediaError> {
    use pdfium_render::prelude::*;

    let page_index_u16: u16 = args
        .page_index
        .try_into()
        .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", args.page_index)))?;
    let page = document
        .pages()
        .get(page_index_u16)
        .map_err(|_| MediaError::new("not_found", format!("頁索引不存在: {}", args.page_index)))?;

    let mut cfg = PdfRenderConfig::new();

    if let Some(w) = args.target_width {
        let width_px_i32 = i32::try_from(w.max(1)).unwrap_or(i32::MAX);
        cfg = cfg.set_target_width(width_px_i32);
    } else if let Some(dpi_val) = args.dpi {
        let w_pt = page.width().value as f32;
        let width_px = ((w_pt * dpi_val / 72.0).ceil() as u32).max(1);
        let width_px_i32 = i32::try_from(width_px).unwrap_or(i32::MAX);
        cfg = cfg.set_target_width(width_px_i32);
    } else {
        let base = 1200.0_f32;
        let s = args.scale.unwrap_or(1.0).max(0.1);
        let width_px = (base * s).round() as u32;
        let width_px_i32 = i32::try_from(width_px).unwrap_or(i32::MAX);
        cfg = cfg.set_target_width(width_px_i32);
    }

    let bitmap = page
        .render_with_config(&cfg)
        .map_err(|e| MediaError::new("parse_error", format!("渲染失敗: {e}")))?;

    let img = bitmap.as_image();
    let (w, h) = (img.width(), img.height());

    let fmt = args
        .format
        .as_ref()
        .cloned()
        .unwrap_or_else(|| "png".to_string())
        .to_lowercase();
    let out_fmt = if fmt == "webp" { "webp" } else if fmt == "jpeg" || fmt == "jpg" { "jpeg" } else { "png" };

    let mut buf: Vec<u8> = Vec::new();
    if out_fmt == "webp" {
        // 使用 webp crate 支援有損編碼
        let rgba = img.to_rgba8();
        let quality = args.quality.unwrap_or(85).clamp(1, 100) as f32;
        let encoder = webp::Encoder::from_rgba(&rgba, rgba.width(), rgba.height());
        let encoded = encoder.encode(quality);
        buf = encoded.to_vec();
    } else if out_fmt == "png" {
        use image::codecs::png::{CompressionType, FilterType, PngEncoder};
        use image::ColorType;
        let rgba = img.to_rgba8();
        let comp = if args.quality.unwrap_or(100) <= 50 { CompressionType::Fast } else { CompressionType::Default };
        let mut enc = PngEncoder::new_with_quality(Cursor::new(&mut buf), comp, FilterType::NoFilter);
        enc.write_image(&rgba, rgba.width(), rgba.height(), ColorType::Rgba8.into())
            .map_err(|e| MediaError::new("io_error", format!("編碼 PNG 失敗: {e}")))?;
    } else if out_fmt == "jpeg" {
        use image::codecs::jpeg::JpegEncoder;
        use image::ColorType;
        // JPEG 不支援帶 alpha 的 RGBA；需轉為 RGB 並丟棄 alpha
        let rgb = img.to_rgb8();
        let enc = JpegEncoder::new_with_quality(Cursor::new(&mut buf), args.quality.unwrap_or(82));
        enc.write_image(&rgb, rgb.width(), rgb.height(), ColorType::Rgb8.into())
            .map_err(|e| MediaError::new("io_error", format!("編碼 JPEG 失敗: {e}")))?;
    } else {
        use image::codecs::png::{CompressionType, FilterType, PngEncoder};
        use image::ColorType;
        let rgba = img.to_rgba8();
        let mut enc = PngEncoder::new_with_quality(Cursor::new(&mut buf), CompressionType::Default, FilterType::NoFilter);
        enc.write_image(&rgba, rgba.width(), rgba.height(), ColorType::Rgba8.into())
            .map_err(|e| MediaError::new("io_error", format!("編碼 PNG 失敗: {e}")))?;
    }

    Ok(PageRender {
        page_index: args.page_index,
        width_px: w as u32,
        height_px: h as u32,
        scale: args.scale,
        dpi: args.dpi,
        format: out_fmt.to_string(),
        image_bytes: buf,
    })
}

// 通用回傳：僅回報頁數
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPagesResult { pub pages: usize }

// 儲存回傳：路徑與頁數
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSaveResult { pub path: String, pub pages: usize }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportImageResult { pub path: String, pub width_px: u32, pub height_px: u32, pub format: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportPdfResult { pub path: String }

#[tauri::command]
pub fn pdf_insert_blank(doc_id: u64, index: u32, width_pt: f32, height_pt: f32) -> Result<PdfPagesResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::InsertBlank { doc_id, index, width_pt, height_pt, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    let pages = rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(PdfPagesResult { pages })
}

#[tauri::command]
pub fn pdf_delete_pages(doc_id: u64, indices: Vec<u32>) -> Result<PdfPagesResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::DeletePages { doc_id, indices, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    let pages = rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(PdfPagesResult { pages })
}

#[tauri::command]
pub fn pdf_rotate_page(doc_id: u64, index: u32, rotate_deg: u16) -> Result<(), MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::RotatePage { doc_id, index, rotate_deg, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(())
}

#[tauri::command]
pub fn pdf_rotate_page_relative(doc_id: u64, index: u32, delta_deg: i16) -> Result<u16, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::RotatePageRelative { doc_id, index, delta_deg, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_copy_page(src_doc_id: u64, src_index: u32, dest_doc_id: u64, dest_index: u32) -> Result<PdfPagesResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::CopyPage { src_doc_id, src_index, dest_doc_id, dest_index, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    let pages = rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(PdfPagesResult { pages })
}

#[tauri::command]
pub fn pdf_save(doc_id: u64, dest_path: Option<String>, overwrite: Option<bool>) -> Result<PdfSaveResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Save { doc_id, dest_path, overwrite, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    let (path, pages) = rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(PdfSaveResult { path, pages })
}

#[tauri::command]
pub fn pdf_export_page_image(doc_id: u64, page_index: u32, dest_path: String, format: Option<String>, target_width: Option<u32>, dpi: Option<f32>, quality: Option<u8>) -> Result<PdfExportImageResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    let fmt = format.unwrap_or_else(|| "png".to_string());
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::ExportImage { doc_id, page_index, dest_path, format: fmt, target_width, dpi, quality, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    let (path, w, h, fmt) = rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(PdfExportImageResult { path, width_px: w, height_px: h, format: fmt })
}

#[tauri::command]
pub fn pdf_export_page_pdf(doc_id: u64, page_index: u32, dest_path: String) -> Result<PdfExportPdfResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock().unwrap().as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::ExportPdf { doc_id, page_index, dest_path, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    let path = rrx.recv().map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(PdfExportPdfResult { path })
}
