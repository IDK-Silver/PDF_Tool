//! 圖像壓縮功能

use crate::error::AppError;
use image::GenericImageView;
use image::ImageEncoder;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::path::Path;
use base64::{Engine as _, engine::general_purpose};

/// 圖像壓縮參數
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressImageArgs {
    pub src_path: String,
    pub dest_path: String,
    pub format: Option<String>,   // 'jpeg' | 'png' | 'webp' | 'preserve'
    pub quality: Option<u8>,      // 1-100 (jpeg/webp only)
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
}

/// 圖像壓縮結果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressImageResult {
    pub path: String,
    pub before_size: u64,
    pub after_size: u64,
    pub width: u32,
    pub height: u32,
    pub format: String,
}

/// 壓縮圖像
///
/// 支援 JPEG、PNG、WebP 格式輸出。
/// 可選擇性縮小尺寸（max_width/max_height）。
#[tauri::command]
pub async fn compress_image(args: CompressImageArgs) -> Result<CompressImageResult, AppError> {
    tokio::task::spawn_blocking(move || compress_image_sync(args))
        .await
        .map_err(|e| AppError::async_error(format!("異步任務失敗: {e}")))?
}

fn compress_image_sync(args: CompressImageArgs) -> Result<CompressImageResult, AppError> {
    let src = Path::new(&args.src_path);
    if !src.exists() {
        return Err(AppError::not_found(format!(
            "來源檔案不存在: {}",
            args.src_path
        )));
    }

    let before_meta = fs::metadata(src)
        .map_err(|e| AppError::io_error(format!("讀取來源檔案資訊失敗: {e}")))?;
    let before_size = before_meta.len();

    // decode
    let bytes = fs::read(src)
        .map_err(|e| AppError::io_error(format!("讀取來源檔案失敗: {e}")))?;
    let mut img = image::load_from_memory(&bytes)
        .map_err(|e| AppError::decode_error(format!("解碼影像失敗: {e}")))?;
    let (mut w, mut h) = img.dimensions();

    // downscale if needed
    (img, w, h) = apply_size_constraints(img, w, h, args.max_width, args.max_height);

    // determine output format
    let chosen_fmt = determine_output_format(&args.format, src);

    // encode
    let out = encode_image(&img, &chosen_fmt, args.quality)?;

    // write
    fs::write(&args.dest_path, &out)
        .map_err(|e| AppError::io_error(format!("寫入輸出檔失敗: {e}")))?;

    let after_meta = fs::metadata(&args.dest_path)
        .map_err(|e| AppError::io_error(format!("讀取輸出檔資訊失敗: {e}")))?;

    Ok(CompressImageResult {
        path: args.dest_path,
        before_size,
        after_size: after_meta.len(),
        width: w,
        height: h,
        format: chosen_fmt,
    })
}

/// 根據 max_width/max_height 約束縮放圖像
fn apply_size_constraints(
    mut img: image::DynamicImage,
    mut w: u32,
    mut h: u32,
    max_width: Option<u32>,
    max_height: Option<u32>,
) -> (image::DynamicImage, u32, u32) {
    match (max_width, max_height) {
        (Some(max_w), Some(max_h)) if max_w > 0 && max_h > 0 => {
            let scale_w = (max_w as f32) / (w as f32);
            let scale_h = (max_h as f32) / (h as f32);
            let scale = scale_w.min(scale_h);
            if scale < 1.0 {
                let new_w = ((w as f32) * scale).floor().max(1.0) as u32;
                let new_h = ((h as f32) * scale).floor().max(1.0) as u32;
                img = img.resize(new_w, new_h, image::imageops::FilterType::Triangle);
                w = new_w;
                h = new_h;
            }
        }
        (Some(max_w), None) if max_w > 0 && w > max_w => {
            let scale = (max_w as f32) / (w as f32);
            let new_w = max_w;
            let new_h = ((h as f32) * scale).floor().max(1.0) as u32;
            img = img.resize(new_w, new_h, image::imageops::FilterType::Triangle);
            w = new_w;
            h = new_h;
        }
        (None, Some(max_h)) if max_h > 0 && h > max_h => {
            let scale = (max_h as f32) / (h as f32);
            let new_h = max_h;
            let new_w = ((w as f32) * scale).floor().max(1.0) as u32;
            img = img.resize(new_w, new_h, image::imageops::FilterType::Triangle);
            w = new_w;
            h = new_h;
        }
        _ => {}
    }
    (img, w, h)
}

/// 決定輸出格式
fn determine_output_format(format: &Option<String>, src: &Path) -> String {
    let req_fmt = format
        .clone()
        .unwrap_or_else(|| "preserve".to_string())
        .to_lowercase();

    if req_fmt == "preserve" {
        let ext = src
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        match ext.as_str() {
            "jpg" | "jpeg" => "jpeg".to_string(),
            "png" => "png".to_string(),
            "webp" => "webp".to_string(),
            _ => "jpeg".to_string(),
        }
    } else {
        req_fmt
    }
}

/// 編碼圖像為指定格式
fn encode_image(
    img: &image::DynamicImage,
    format: &str,
    quality: Option<u8>,
) -> Result<Vec<u8>, AppError> {
    let mut out: Vec<u8> = Vec::new();

    match format {
        "jpeg" => {
            use image::ColorType;
            // flatten alpha onto white background if exists
            let rgba = img.to_rgba8();
            let (iw, ih) = (rgba.width(), rgba.height());
            let mut bg = image::RgbaImage::from_pixel(iw, ih, image::Rgba([255, 255, 255, 255]));
            image::imageops::overlay(&mut bg, &rgba, 0, 0);
            let rgb = image::DynamicImage::ImageRgba8(bg).to_rgb8();
            let q = quality.unwrap_or(82).clamp(1, 100);
            let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(Cursor::new(&mut out), q);
            enc.write_image(&rgb, rgb.width(), rgb.height(), ColorType::Rgb8.into())
                .map_err(|e| AppError::encode_error(format!("JPEG 編碼失敗: {e}")))?;
        }
        "png" => {
            use image::ColorType;
            let rgba = img.to_rgba8();
            let enc = image::codecs::png::PngEncoder::new_with_quality(
                Cursor::new(&mut out),
                image::codecs::png::CompressionType::Default,
                image::codecs::png::FilterType::NoFilter,
            );
            enc.write_image(&rgba, rgba.width(), rgba.height(), ColorType::Rgba8.into())
                .map_err(|e| AppError::encode_error(format!("PNG 編碼失敗: {e}")))?;
        }
        "webp" => {
            let rgba = img.to_rgba8();
            let q = quality.unwrap_or(82).clamp(1, 100) as f32;
            let encoder = webp::Encoder::from_rgba(&rgba, rgba.width(), rgba.height());
            let encoded = encoder.encode(q);
            out = encoded.to_vec();
        }
        other => {
            return Err(AppError::invalid_input(format!(
                "不支援的輸出格式: {other}"
            )));
        }
    }

    Ok(out)
}

/// 儲存 Base64 編碼的圖像數據到檔案
///
/// 用於儲存從前端 Canvas 匯出的圖像（帶有標注）
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveImageBytesArgs {
    pub dest_path: String,
    pub data_base64: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveImageBytesResult {
    pub path: String,
    pub size: u64,
}

#[tauri::command]
pub async fn save_image_bytes(args: SaveImageBytesArgs) -> Result<SaveImageBytesResult, AppError> {
    tokio::task::spawn_blocking(move || save_image_bytes_sync(args))
        .await
        .map_err(|e| AppError::async_error(format!("異步任務失敗: {e}")))?
}

fn save_image_bytes_sync(args: SaveImageBytesArgs) -> Result<SaveImageBytesResult, AppError> {
    // Decode base64
    let bytes = general_purpose::STANDARD
        .decode(&args.data_base64)
        .map_err(|e| AppError::decode_error(format!("Base64 解碼失敗: {e}")))?;

    // Write to file
    fs::write(&args.dest_path, &bytes)
        .map_err(|e| AppError::io_error(format!("寫入檔案失敗: {e}")))?;

    let meta = fs::metadata(&args.dest_path)
        .map_err(|e| AppError::io_error(format!("讀取檔案資訊失敗: {e}")))?;

    Ok(SaveImageBytesResult {
        path: args.dest_path,
        size: meta.len(),
    })
}
