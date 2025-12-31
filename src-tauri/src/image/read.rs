//! 圖像讀取功能

use crate::error::AppError;
use serde::Serialize;
use std::fs;
use std::path::Path;

/// 圖像讀取結果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageReadResult {
    pub width: u32,
    pub height: u32,
    pub image_bytes: Vec<u8>,
    pub mime_type: String,
}

/// 讀取圖像檔案並回傳其尺寸、原始位元組和 MIME 類型
#[tauri::command]
pub fn image_read(path: String) -> Result<ImageReadResult, AppError> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(AppError::not_found(format!("圖片檔案不存在: {}", path)));
    }

    // 讀取圖片檔案
    let bytes =
        fs::read(p).map_err(|e| AppError::io_error(format!("讀取圖片失敗: {e}")))?;

    // 使用 image crate 解碼圖片以取得寬高
    let img = image::load_from_memory(&bytes)
        .map_err(|e| AppError::decode_error(format!("解碼圖片失敗: {e}")))?;

    let width = img.width();
    let height = img.height();

    // 推斷 MIME 類型
    let mime_type = infer_mime_type(p);

    Ok(ImageReadResult {
        width,
        height,
        image_bytes: bytes,
        mime_type,
    })
}

/// 根據副檔名推斷 MIME 類型
fn infer_mime_type(path: &Path) -> String {
    match path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
    {
        Some(ext) if ext == "png" => "image/png",
        Some(ext) if ext == "jpg" || ext == "jpeg" => "image/jpeg",
        Some(ext) if ext == "webp" => "image/webp",
        Some(ext) if ext == "gif" => "image/gif",
        Some(ext) if ext == "bmp" => "image/bmp",
        Some(ext) if ext == "tiff" || ext == "tif" => "image/tiff",
        _ => "application/octet-stream",
    }
    .to_string()
}
