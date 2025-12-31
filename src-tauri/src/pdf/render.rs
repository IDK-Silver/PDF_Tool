//! PDF 頁面渲染
//!
//! 負責將 PDF 頁面渲染為圖像。

use crate::error::MediaError;
use image::ImageEncoder;
use serde::{Deserialize, Serialize};
use std::io::Cursor;

/// PDF 渲染參數
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

/// 頁面渲染結果
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

/// 渲染 PDF 頁面
///
/// 將指定頁面渲染為圖像，支援多種輸出格式（PNG、JPEG、WebP、Raw）。
pub fn render_page_for_document(
    document: &pdfium_render::prelude::PdfDocument,
    args: &PdfRenderArgs,
) -> Result<PageRender, MediaError> {
    use pdfium_render::prelude::*;

    let page_index_u16: u16 = args.page_index.try_into().map_err(|_| {
        MediaError::new("invalid_input", format!("頁索引過大: {}", args.page_index))
    })?;
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
    let out_fmt = if fmt == "raw" {
        "raw" // 直接傳 raw RGBA bitmap
    } else if fmt == "webp" {
        "webp"
    } else if fmt == "jpeg" || fmt == "jpg" {
        "jpeg"
    } else {
        "png"
    };

    let mut buf: Vec<u8> = Vec::new();
    if out_fmt == "raw" {
        // 直接傳 RGBA raw bytes（無需編碼）
        let rgba = img.to_rgba8();
        buf = rgba.into_raw(); // 零開銷：直接取得底層 Vec<u8>
    } else if out_fmt == "webp" {
        // 使用 webp crate 支援有損編碼
        let rgba = img.to_rgba8();
        let quality = args.quality.unwrap_or(85).clamp(1, 100) as f32;
        let encoder = webp::Encoder::from_rgba(&rgba, rgba.width(), rgba.height());
        let encoded = encoder.encode(quality);
        buf = encoded.to_vec();
    } else if out_fmt == "png" {
        // 使用 png crate 直接編碼，以便嵌入 DPI metadata (pHYs chunk)
        let rgba = img.to_rgba8();
        let mut encoder = png::Encoder::new(Cursor::new(&mut buf), rgba.width(), rgba.height());
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);

        // 設定壓縮等級
        let comp = if args.quality.unwrap_or(100) <= 50 {
            png::Compression::Fast
        } else {
            png::Compression::Default
        };
        encoder.set_compression(comp);

        // 嵌入 DPI metadata：pHYs chunk 使用「每公尺像素數」
        // 轉換公式：pixels_per_meter = dpi * 39.3701 (1 inch = 0.0254 m)
        if let Some(dpi_val) = args.dpi {
            let ppm = (dpi_val * 39.3701).round() as u32;
            encoder.set_pixel_dims(Some(png::PixelDimensions {
                xppu: ppm,
                yppu: ppm,
                unit: png::Unit::Meter,
            }));
        }

        let mut writer = encoder
            .write_header()
            .map_err(|e| MediaError::new("io_error", format!("編碼 PNG 失敗: {e}")))?;
        writer
            .write_image_data(rgba.as_raw())
            .map_err(|e| MediaError::new("io_error", format!("編碼 PNG 失敗: {e}")))?;
    } else if out_fmt == "jpeg" {
        use image::ColorType;
        use image::codecs::jpeg::JpegEncoder;
        // JPEG 不支援帶 alpha 的 RGBA；需轉為 RGB 並丟棄 alpha
        let rgb = img.to_rgb8();
        let enc = JpegEncoder::new_with_quality(Cursor::new(&mut buf), args.quality.unwrap_or(82));
        enc.write_image(&rgb, rgb.width(), rgb.height(), ColorType::Rgb8.into())
            .map_err(|e| MediaError::new("io_error", format!("編碼 JPEG 失敗: {e}")))?;

        // 嵌入 DPI metadata：修改 JFIF 頭部的密度欄位
        // JFIF 頭部結構（從 FF D8 開始）：
        //   [0-1] FF D8 (SOI)
        //   [2-3] FF E0 (APP0 marker)
        //   [4-5] 長度
        //   [6-10] "JFIF\0"
        //   [11-12] 版本
        //   [13] 單位 (01 = DPI)
        //   [14-15] X 密度 (big-endian)
        //   [16-17] Y 密度 (big-endian)
        if let Some(dpi_val) = args.dpi {
            // 確認是 JFIF 格式（檢查 APP0 marker 和 JFIF 標識）
            if buf.len() >= 18
                && buf[0..2] == [0xFF, 0xD8]
                && buf[2..4] == [0xFF, 0xE0]
                && buf[6..11] == *b"JFIF\0"
            {
                let dpi_u16 = (dpi_val.round() as u16).max(1);
                buf[13] = 0x01; // 單位 = DPI
                buf[14] = (dpi_u16 >> 8) as u8; // X 密度高位
                buf[15] = (dpi_u16 & 0xFF) as u8; // X 密度低位
                buf[16] = (dpi_u16 >> 8) as u8; // Y 密度高位
                buf[17] = (dpi_u16 & 0xFF) as u8; // Y 密度低位
            }
        }
    } else {
        // Fallback: 使用 png crate 編碼，並嵌入 DPI metadata
        let rgba = img.to_rgba8();
        let mut encoder = png::Encoder::new(Cursor::new(&mut buf), rgba.width(), rgba.height());
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::Default);

        if let Some(dpi_val) = args.dpi {
            let ppm = (dpi_val * 39.3701).round() as u32;
            encoder.set_pixel_dims(Some(png::PixelDimensions {
                xppu: ppm,
                yppu: ppm,
                unit: png::Unit::Meter,
            }));
        }

        let mut writer = encoder
            .write_header()
            .map_err(|e| MediaError::new("io_error", format!("編碼 PNG 失敗: {e}")))?;
        writer
            .write_image_data(rgba.as_raw())
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
