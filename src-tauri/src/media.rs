use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::mpsc;

// Re-export from error module
pub use crate::error::MediaError;

// Re-export from pdf module
pub use crate::pdf::{
    AddImageResult, ImageToPdfResult, MutationResult, PageRender, PageTextContent,
    PdfExportImageResult, PdfExportPdfResult, PdfOpenResult, PdfPageSize, PdfRenderArgs,
    RotationResult, SaveResult, TextLayerSettings,
};
use crate::pdf::{PdfRequest, WORKER_TX};

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

fn infer_media_type(path: &Path) -> MediaType {
    match path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
    {
        Some(ext) if matches!(ext.as_str(), "pdf") => MediaType::Pdf,
        Some(ext)
            if matches!(
                ext.as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "tiff" | "tif"
            ) =>
        {
            MediaType::Image
        }
        _ => MediaType::Unknown,
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string()
}

fn try_stat_size(path: &Path) -> Option<u64> {
    fs::metadata(path).ok().map(|m| m.len())
}

#[tauri::command]
pub fn analyze_media(path: String) -> Result<MediaDescriptor, MediaError> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(MediaError::new(
            "not_found",
            format!("檔案不存在: {}", path),
        ));
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

#[tauri::command]
pub fn pdf_open(path: String) -> Result<PdfOpenResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Open { path, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_close(doc_id: u64) -> Result<(), MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Close { doc_id, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_page_size(doc_id: u64, page_index: u32) -> Result<PdfPageSize, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Size {
            doc_id,
            page_index,
            reply: rtx,
        })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_get_page_text(
    doc_id: u64,
    page_index: u32,
    settings: Option<TextLayerSettings>,
) -> Result<PageTextContent, MediaError> {
    let settings = settings.unwrap_or_default();
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::GetPageText {
            doc_id,
            page_index,
            settings,
            reply: rtx,
        })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_render_page(args: PdfRenderArgs) -> Result<PageRender, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Render { args, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub async fn pdf_render_page_async(args: PdfRenderArgs) -> Result<PageRender, MediaError> {
    tokio::task::spawn_blocking(move || -> Result<PageRender, MediaError> {
        let (rtx, rrx) = mpsc::channel();
        WORKER_TX
            .lock()
            .unwrap()
            .as_ref()
            .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
            .send(PdfRequest::Render { args, reply: rtx })
            .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;

        rrx.recv()
            .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
    })
    .await
    .map_err(|e| MediaError::new("async_error", format!("異步任務失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_render_cancel(doc_id: u64, page_index: u32, min_gen: u64) -> Result<(), MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Cancel {
            doc_id,
            page_index,
            min_gen,
            reply: rtx,
        })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_insert_blank(
    doc_id: u64,
    index: u32,
    width_pt: f32,
    height_pt: f32,
) -> Result<MutationResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::InsertBlank {
            doc_id,
            index,
            width_pt,
            height_pt,
            reply: rtx,
        })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    let res = rrx
        .recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(res)
}

#[tauri::command]
pub fn pdf_delete_pages(doc_id: u64, indices: Vec<u32>) -> Result<MutationResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::DeletePages {
            doc_id,
            indices,
            reply: rtx,
        })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    let res = rrx
        .recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(res)
}

#[tauri::command]
pub fn pdf_rotate_page(
    doc_id: u64,
    index: u32,
    rotate_deg: u16,
) -> Result<RotationResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::RotatePage {
            doc_id,
            index,
            rotate_deg,
            reply: rtx,
        })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    Ok(
        rrx.recv()
            .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??,
    )
}

#[tauri::command]
pub fn pdf_rotate_page_relative(
    doc_id: u64,
    index: u32,
    delta_deg: i16,
) -> Result<RotationResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::RotatePageRelative {
            doc_id,
            index,
            delta_deg,
            reply: rtx,
        })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    Ok(
        rrx.recv()
            .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??,
    )
}

#[tauri::command]
pub fn pdf_copy_page(
    src_doc_id: u64,
    src_index: u32,
    dest_doc_id: u64,
    dest_index: u32,
) -> Result<MutationResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::CopyPage {
            src_doc_id,
            src_index,
            dest_doc_id,
            dest_index,
            reply: rtx,
        })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    let res = rrx
        .recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(res)
}

#[tauri::command]
pub fn pdf_undo(doc_id: u64) -> Result<MutationResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Undo { doc_id, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_redo(doc_id: u64) -> Result<MutationResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Redo { doc_id, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_save(
    doc_id: u64,
    dest_path: Option<String>,
    overwrite: Option<bool>,
) -> Result<SaveResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Save {
            doc_id,
            dest_path,
            overwrite,
            reply: rtx,
        })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    let res = rrx
        .recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(res)
}

#[tauri::command]
pub fn pdf_export_page_image(
    doc_id: u64,
    page_index: u32,
    dest_path: String,
    format: Option<String>,
    target_width: Option<u32>,
    dpi: Option<f32>,
    quality: Option<u8>,
) -> Result<PdfExportImageResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    let fmt = format.unwrap_or_else(|| "png".to_string());
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::ExportImage {
            doc_id,
            page_index,
            dest_path,
            format: fmt,
            target_width,
            dpi,
            quality,
            reply: rtx,
        })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    let (path, w, h, fmt) = rrx
        .recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(PdfExportImageResult {
        path,
        width_px: w,
        height_px: h,
        format: fmt,
    })
}

#[tauri::command]
pub fn pdf_export_page_pdf(
    doc_id: u64,
    page_index: u32,
    dest_path: String,
) -> Result<PdfExportPdfResult, MediaError> {
    let (rtx, rrx) = mpsc::channel();
    WORKER_TX
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::ExportPdf {
            doc_id,
            page_index,
            dest_path,
            reply: rtx,
        })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    let path = rrx
        .recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(PdfExportPdfResult { path })
}

#[tauri::command]
pub async fn image_to_pdf(src_path: String, dest_path: String) -> Result<ImageToPdfResult, MediaError> {
    tokio::task::spawn_blocking(move || -> Result<ImageToPdfResult, MediaError> {
        let (rtx, rrx) = mpsc::channel();
        WORKER_TX
            .lock()
            .unwrap()
            .as_ref()
            .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
            .send(PdfRequest::ImageToPdf {
                src_path,
                dest_path,
                reply: rtx,
            })
            .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
        rrx.recv()
            .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
    })
    .await
    .map_err(|e| MediaError::new("async_error", format!("異步任務失敗: {e}")))?
}

/// PoC: Add image to existing PDF page
#[tauri::command]
pub async fn pdf_add_image_to_page(
    doc_id: u64,
    page_index: u32,
    image_bytes: Vec<u8>,
    x_pt: f32,
    y_pt: f32,
    width_pt: f32,
    height_pt: f32,
) -> Result<AddImageResult, MediaError> {
    tokio::task::spawn_blocking(move || -> Result<AddImageResult, MediaError> {
        let (rtx, rrx) = mpsc::channel();
        WORKER_TX
            .lock()
            .unwrap()
            .as_ref()
            .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
            .send(PdfRequest::AddImageToPage {
                doc_id,
                page_index,
                image_bytes,
                x_pt,
                y_pt,
                width_pt,
                height_pt,
                reply: rtx,
            })
            .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
        rrx.recv()
            .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
    })
    .await
    .map_err(|e| MediaError::new("async_error", format!("異步任務失敗: {e}")))?
}

/// Add text to existing PDF page as real PDF text object
#[tauri::command]
pub async fn pdf_add_text_to_page(
    doc_id: u64,
    page_index: u32,
    text: String,
    x_pt: f32,
    y_pt: f32,
    font_size: f32,
    color: String,
) -> Result<AddImageResult, MediaError> {
    tokio::task::spawn_blocking(move || -> Result<AddImageResult, MediaError> {
        let (rtx, rrx) = mpsc::channel();
        WORKER_TX
            .lock()
            .unwrap()
            .as_ref()
            .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
            .send(PdfRequest::AddTextToPage {
                doc_id,
                page_index,
                text,
                x_pt,
                y_pt,
                font_size,
                color,
                reply: rtx,
            })
            .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
        rrx.recv()
            .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
    })
    .await
    .map_err(|e| MediaError::new("async_error", format!("異步任務失敗: {e}")))?
}
