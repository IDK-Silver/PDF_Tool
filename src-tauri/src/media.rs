use flate2::read::ZlibDecoder;
use image::GenericImageView;
use image::ImageEncoder;
use log::warn;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::{
    Mutex,
    atomic::{AtomicU64, Ordering},
    mpsc,
};
// no timestamp usage currently

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct MediaError {
    pub code: String,
    pub message: String,
}

impl MediaError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
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

// =====================
// Compression commands
// =====================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressImageArgs {
    pub src_path: String,
    pub dest_path: String,
    pub format: Option<String>,        // 'jpeg' | 'png' | 'webp' | 'preserve'
    pub quality: Option<u8>,           // 1-100 (jpeg/webp only)
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
}

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

#[tauri::command]
pub async fn compress_image(args: CompressImageArgs) -> Result<CompressImageResult, MediaError> {
    tokio::task::spawn_blocking(move || -> Result<CompressImageResult, MediaError> {
        let src = Path::new(&args.src_path);
        if !src.exists() {
            return Err(MediaError::new("not_found", format!("來源檔案不存在: {}", args.src_path)));
        }
        let before_meta = fs::metadata(src).map_err(|e| MediaError::new("io_error", format!("讀取來源檔案資訊失敗: {e}")))?;
        let before_size = before_meta.len();

        // decode
        let bytes = fs::read(src).map_err(|e| MediaError::new("io_error", format!("讀取來源檔案失敗: {e}")))?;
        let mut img = image::load_from_memory(&bytes).map_err(|e| MediaError::new("decode_error", format!("解碼影像失敗: {e}")))?;
        let (mut w, mut h) = img.dimensions();

        // downscale if needed
        if let (Some(max_w), Some(max_h)) = (args.max_width, args.max_height) {
            if max_w > 0 && max_h > 0 {
                let scale_w = (max_w as f32) / (w as f32);
                let scale_h = (max_h as f32) / (h as f32);
                let scale = scale_w.min(scale_h);
                if scale < 1.0 {
                    let new_w = ((w as f32) * scale).floor().max(1.0) as u32;
                    let new_h = ((h as f32) * scale).floor().max(1.0) as u32;
                    img = img.resize(new_w, new_h, image::imageops::FilterType::Triangle);
                    w = new_w; h = new_h;
                }
            }
        } else if let Some(max_w) = args.max_width { // only width cap
            if max_w > 0 && w > max_w {
                let scale = (max_w as f32) / (w as f32);
                let new_w = max_w;
                let new_h = ((h as f32) * scale).floor().max(1.0) as u32;
                img = img.resize(new_w, new_h, image::imageops::FilterType::Triangle);
                w = new_w; h = new_h;
            }
        } else if let Some(max_h) = args.max_height { // only height cap
            if max_h > 0 && h > max_h {
                let scale = (max_h as f32) / (h as f32);
                let new_h = max_h;
                let new_w = ((w as f32) * scale).floor().max(1.0) as u32;
                img = img.resize(new_w, new_h, image::imageops::FilterType::Triangle);
                w = new_w; h = new_h;
            }
        }

        let req_fmt = args.format.unwrap_or_else(|| "preserve".to_string()).to_lowercase();
        let chosen_fmt = if req_fmt == "preserve" {
            let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            if ext == "jpg" || ext == "jpeg" { "jpeg".to_string() }
            else if ext == "png" { "png".to_string() }
            else if ext == "webp" { "webp".to_string() }
            else { "jpeg".to_string() }
        } else { req_fmt };

        let mut out: Vec<u8> = Vec::new();
        match chosen_fmt.as_str() {
            "jpeg" => {
                use image::ColorType;
                // flatten alpha onto white background if exists
                let rgba = img.to_rgba8();
                let (iw, ih) = (rgba.width(), rgba.height());
                let mut bg = image::RgbaImage::from_pixel(iw, ih, image::Rgba([255, 255, 255, 255]));
                image::imageops::overlay(&mut bg, &rgba, 0, 0);
                let rgb = image::DynamicImage::ImageRgba8(bg).to_rgb8();
                let q = args.quality.unwrap_or(82).clamp(1, 100);
                let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(Cursor::new(&mut out), q);
                enc.write_image(&rgb, rgb.width(), rgb.height(), ColorType::Rgb8.into())
                    .map_err(|e| MediaError::new("encode_error", format!("JPEG 編碼失敗: {e}")))?;
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
                    .map_err(|e| MediaError::new("encode_error", format!("PNG 編碼失敗: {e}")))?;
            }
            "webp" => {
                let rgba = img.to_rgba8();
                let q = args.quality.unwrap_or(82).clamp(1, 100) as f32;
                let encoder = webp::Encoder::from_rgba(&rgba, rgba.width(), rgba.height());
                let encoded = encoder.encode(q);
                out = encoded.to_vec();
            }
            other => {
                return Err(MediaError::new("invalid_input", format!("不支援的輸出格式: {other}")));
            }
        }

        // write
        fs::write(&args.dest_path, &out).map_err(|e| MediaError::new("io_error", format!("寫入輸出檔失敗: {e}")))?;
        let after_meta = fs::metadata(&args.dest_path).map_err(|e| MediaError::new("io_error", format!("讀取輸出檔資訊失敗: {e}")))?;
        Ok(CompressImageResult {
            path: args.dest_path,
            before_size,
            after_size: after_meta.len(),
            width: w,
            height: h,
            format: chosen_fmt,
        })
    }).await.map_err(|e| MediaError::new("async_error", format!("異步任務失敗: {e}")))?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressPdfLosslessArgs {
    pub src_path: String,
    pub dest_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressPdfLosslessResult {
    pub path: String,
    pub before_size: u64,
    pub after_size: u64,
}

#[tauri::command]
pub async fn compress_pdf_lossless(args: CompressPdfLosslessArgs) -> Result<CompressPdfLosslessResult, MediaError> {
    // 純 Rust v1 佔位：暫以安全複製檔案實作，之後將改為使用 pdf/pdf-writer 重寫結構與重壓 streams。
    tokio::task::spawn_blocking(move || -> Result<CompressPdfLosslessResult, MediaError> {
        let src = Path::new(&args.src_path);
        if !src.exists() {
            return Err(MediaError::new("not_found", format!("來源檔案不存在: {}", args.src_path)));
        }
        let before_meta = fs::metadata(src).map_err(|e| MediaError::new("io_error", format!("讀取來源檔案資訊失敗: {e}")))?;
        let before_size = before_meta.len();

        // 若目標與來源相同，避免覆寫：回傳原檔資訊
        if args.dest_path == args.src_path {
            return Ok(CompressPdfLosslessResult { path: args.dest_path, before_size, after_size: before_size });
        }

        // 直接複製（no-op 最小可行版本）
        fs::copy(&args.src_path, &args.dest_path)
            .map_err(|e| MediaError::new("io_error", format!("寫入輸出檔失敗: {e}")))?;
        let after_meta = fs::metadata(&args.dest_path).map_err(|e| MediaError::new("io_error", format!("讀取輸出檔資訊失敗: {e}")))?;
        Ok(CompressPdfLosslessResult { path: args.dest_path, before_size, after_size: after_meta.len() })
    }).await.map_err(|e| MediaError::new("async_error", format!("異步任務失敗: {e}")))?
}

// ------- v1 Smart compression (JPEG/Flate + basic structure optimize) -------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressPdfSmartArgs {
    pub src_path: String,
    pub dest_path: String,
    pub target_effective_dpi: Option<f32>,
    pub downsample_rule: Option<String>,      // 'always' | 'whenAbove' （v1 暫不套用）
    pub threshold_effective_dpi: Option<f32>, // v1 暫不套用
    pub format: Option<String>,               // 'jpeg' | 'keep'
    pub quality: Option<u8>,                  // 1-100（僅 JPEG 生效）
    pub lossless_optimize: Option<bool>,
    pub remove_metadata: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressPdfSmartResult {
    pub path: String,
    pub before_size: u64,
    pub after_size: u64,
    pub pages: usize,
    pub changed_images: usize,
}

#[derive(Clone, Copy, Debug)]
enum PdfColorSpaceKind {
    Gray,
    Rgb,
}

fn resolve_object(doc: &lopdf::Document, obj: &lopdf::Object) -> Option<lopdf::Object> {
    let mut current = obj.clone();
    for _ in 0..8 {
        if let lopdf::Object::Reference(id) = current {
            current = doc.get_object(id).ok()?.clone();
        } else {
            return Some(current);
        }
    }
    None
}

fn resolve_dict(doc: &lopdf::Document, obj: &lopdf::Object) -> Option<lopdf::Dictionary> {
    match resolve_object(doc, obj)? {
        lopdf::Object::Dictionary(dict) => Some(dict),
        lopdf::Object::Stream(stream) => Some(stream.dict),
        lopdf::Object::Array(items) => {
            for item in items.iter() {
                if let Some(dict) = resolve_dict(doc, item) {
                    return Some(dict);
                }
            }
            None
        }
        lopdf::Object::Reference(_) => None,
        _ => None,
    }
}

fn dict_get_i64(doc: &lopdf::Document, dict: &lopdf::Dictionary, key: &[u8]) -> Option<i64> {
    let raw = dict.get(key).ok()?;
    match resolve_object(doc, raw)? {
        lopdf::Object::Integer(v) => Some(v),
        lopdf::Object::Real(v) => Some(v as i64),
        _ => None,
    }
}

fn dict_get_usize(doc: &lopdf::Document, dict: &lopdf::Dictionary, key: &[u8]) -> Option<usize> {
    dict_get_i64(doc, dict, key).and_then(|v| if v > 0 { usize::try_from(v).ok() } else { None })
}

fn infer_color_space_kind(doc: &lopdf::Document, color_space: Option<lopdf::Object>) -> Option<PdfColorSpaceKind> {
    match color_space {
        None => Some(PdfColorSpaceKind::Gray), // default fallback per spec
        Some(obj) => match obj {
            lopdf::Object::Reference(id) => {
                let resolved = doc.get_object(id).ok()?.clone();
                infer_color_space_kind(doc, Some(resolved))
            }
            lopdf::Object::Name(name) => match name.as_slice() {
                b"DeviceRGB" => Some(PdfColorSpaceKind::Rgb),
                b"DeviceGray" => Some(PdfColorSpaceKind::Gray),
                b"CalRGB" => Some(PdfColorSpaceKind::Rgb),
                b"CalGray" => Some(PdfColorSpaceKind::Gray),
                _ => None,
            },
            lopdf::Object::Array(items) => {
                if items.is_empty() {
                    return None;
                }
                match &items[0] {
                    lopdf::Object::Name(name) if name.as_slice() == b"ICCBased" => {
                        if let Some(profile_obj) = items.get(1) {
                            if let Some(dict) = resolve_dict(doc, profile_obj) {
                                match dict_get_usize(doc, &dict, b"N") {
                                    Some(1) => Some(PdfColorSpaceKind::Gray),
                                    Some(3) => Some(PdfColorSpaceKind::Rgb),
                                    _ => None,
                                }
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    }
                    lopdf::Object::Name(name) if name.as_slice() == b"CalRGB" => Some(PdfColorSpaceKind::Rgb),
                    lopdf::Object::Name(name) if name.as_slice() == b"CalGray" => Some(PdfColorSpaceKind::Gray),
                    _ => None,
                }
            }
            _ => None,
        },
    }
}

fn decode_png_predictor(
    data: &[u8],
    columns: usize,
    components: usize,
    bits_per_component: usize,
    height: usize,
) -> Option<Vec<u8>> {
    if bits_per_component != 8 {
        return None;
    }
    let bytes_per_pixel = components.checked_mul(bits_per_component / 8)?;
    if bytes_per_pixel == 0 {
        return None;
    }
    let row_bytes = columns.checked_mul(bytes_per_pixel)?;
    if row_bytes == 0 {
        return None;
    }
    let stride = row_bytes + 1;
    if stride == 0 || data.len() % stride != 0 {
        return None;
    }
    let rows = data.len() / stride;
    if rows != height {
        return None;
    }

    let mut output = Vec::with_capacity(row_bytes * rows);
    let mut prev_row = vec![0u8; row_bytes];

    for row_idx in 0..rows {
        let offset = row_idx * stride;
        let filter = data[offset];
        let row = &data[offset + 1..offset + stride];
        let mut recon = vec![0u8; row_bytes];

        match filter {
            0 => recon.copy_from_slice(row),
            1 => {
                for i in 0..row_bytes {
                    let left = if i >= bytes_per_pixel {
                        recon[i - bytes_per_pixel]
                    } else {
                        0
                    };
                    recon[i] = row[i].wrapping_add(left);
                }
            }
            2 => {
                for i in 0..row_bytes {
                    recon[i] = row[i].wrapping_add(prev_row[i]);
                }
            }
            3 => {
                for i in 0..row_bytes {
                    let left = if i >= bytes_per_pixel {
                        recon[i - bytes_per_pixel]
                    } else {
                        0
                    };
                    let up = prev_row[i];
                    let avg = ((left as u16 + up as u16) / 2) as u8;
                    recon[i] = row[i].wrapping_add(avg);
                }
            }
            4 => {
                for i in 0..row_bytes {
                    let left = if i >= bytes_per_pixel {
                        recon[i - bytes_per_pixel]
                    } else {
                        0
                    };
                    let up = prev_row[i];
                    let up_left = if i >= bytes_per_pixel {
                        prev_row[i - bytes_per_pixel]
                    } else {
                        0
                    };
                    recon[i] = row[i].wrapping_add(paeth_predictor(left, up, up_left));
                }
            }
            _ => return None,
        }

        prev_row.copy_from_slice(&recon);
        output.extend_from_slice(&recon);
    }

    Some(output)
}

fn paeth_predictor(a: u8, b: u8, c: u8) -> u8 {
    let a = a as i32;
    let b = b as i32;
    let c = c as i32;
    let p = a + b - c;
    let pa = (p - a).abs();
    let pb = (p - b).abs();
    let pc = (p - c).abs();
    if pa <= pb && pa <= pc {
        a as u8
    } else if pb <= pc {
        b as u8
    } else {
        c as u8
    }
}

fn apply_predictor(
    data: Vec<u8>,
    predictor: i64,
    columns: usize,
    components: usize,
    bits_per_component: usize,
    height: usize,
) -> Option<Vec<u8>> {
    match predictor {
        0 | 1 => Some(data),
        10..=15 => decode_png_predictor(&data, columns, components, bits_per_component, height),
        _ => None,
    }
}

fn decode_flate_image_stream(
    doc: &lopdf::Document,
    stream: &lopdf::Stream,
) -> Option<image::DynamicImage> {
    if stream
        .dict
        .get(b"ImageMask")
        .ok()
        .and_then(|o| o.as_bool().ok())
        .unwrap_or(false)
    {
        return None;
    }

    let width = stream
        .dict
        .get(b"Width")
        .ok()
        .and_then(|o| o.as_i64().ok())
        .and_then(|v| u32::try_from(v).ok())?;
    let height = stream
        .dict
        .get(b"Height")
        .ok()
        .and_then(|o| o.as_i64().ok())
        .and_then(|v| u32::try_from(v).ok())?;
    if width == 0 || height == 0 {
        return None;
    }

    let mut bits_per_component = stream
        .dict
        .get(b"BitsPerComponent")
        .ok()
        .and_then(|o| o.as_i64().ok())
        .unwrap_or(8) as usize;

    let decode_parms = stream
        .dict
        .get(b"DecodeParms")
        .ok()
        .and_then(|obj| resolve_dict(doc, obj));

    if let Some(ref parms) = decode_parms {
        if let Some(bits) = dict_get_usize(doc, parms, b"BitsPerComponent") {
            bits_per_component = bits;
        }
    }

    if bits_per_component != 8 {
        return None;
    }

    let mut components = stream
        .dict
        .get(b"ColorSpace")
        .ok()
        .cloned()
        .and_then(|obj| infer_color_space_kind(doc, Some(obj)))
        .or_else(|| infer_color_space_kind(doc, None))
        .and_then(|kind| match kind {
            PdfColorSpaceKind::Gray => Some(1usize),
            PdfColorSpaceKind::Rgb => Some(3usize),
        })?;

    if let Some(ref parms) = decode_parms {
        if let Some(colors) = dict_get_usize(doc, parms, b"Colors") {
            components = colors;
        }
    }

    if components == 0 || (components != 1 && components != 3) {
        return None;
    }

    let columns = decode_parms
        .as_ref()
        .and_then(|parms| dict_get_usize(doc, parms, b"Columns"))
        .unwrap_or(width as usize);

    let predictor = decode_parms
        .as_ref()
        .and_then(|parms| dict_get_i64(doc, parms, b"Predictor"))
        .unwrap_or(1);

    let mut decoder = ZlibDecoder::new(stream.content.as_slice());
    let mut decoded = Vec::new();
    if let Err(err) = decoder.read_to_end(&mut decoded) {
        warn!("Flate decode failed: {}", err);
        return None;
    }

    let decoded = apply_predictor(
        decoded,
        predictor,
        columns,
        components,
        bits_per_component,
        height as usize,
    )?;

    let row_stride = columns.checked_mul(components)?;
    if decoded.len() != row_stride * height as usize {
        warn!(
            "Decoded data length mismatch: got {}, expected {}",
            decoded.len(),
            row_stride * height as usize
        );
        return None;
    }

    let expected_stride = width as usize * components;
    let pixel_bytes = if columns == width as usize {
        decoded
    } else if columns > width as usize {
        let mut trimmed = Vec::with_capacity(expected_stride * height as usize);
        for row in 0..height as usize {
            let start = row * row_stride;
            let end = start + expected_stride;
            trimmed.extend_from_slice(&decoded[start..end]);
        }
        trimmed
    } else {
        return None;
    };

    let image = match components {
        1 => {
            if let Some(buf) = image::GrayImage::from_vec(width, height, pixel_bytes) {
                image::DynamicImage::ImageLuma8(buf)
            } else {
                return None;
            }
        }
        3 => {
            if let Some(buf) = image::RgbImage::from_vec(width, height, pixel_bytes) {
                image::DynamicImage::ImageRgb8(buf)
            } else {
                return None;
            }
        }
        _ => return None,
    };

    Some(image)
}

#[tauri::command]
pub async fn compress_pdf_smart(args: CompressPdfSmartArgs) -> Result<CompressPdfSmartResult, MediaError> {
    tokio::task::spawn_blocking(move || -> Result<CompressPdfSmartResult, MediaError> {
        use lopdf::{Document, Object};

        let src = Path::new(&args.src_path);
        if !src.exists() {
            return Err(MediaError::new("not_found", format!("來源檔案不存在: {}", args.src_path)));
        }

        let before_meta = fs::metadata(src)
            .map_err(|e| MediaError::new("io_error", format!("讀取來源檔案資訊失敗: {e}")))?;
        let before_size = before_meta.len();

        let mut doc = Document::load(&args.src_path)
            .map_err(|e| MediaError::new("parse_error", format!("讀取 PDF 失敗: {e}")))?;

        // 移除 metadata（可選）
        if args.remove_metadata.unwrap_or(true) {
            let _ = doc.trailer.remove(b"Info");
            if let Ok(root_id) = doc.trailer.get(b"Root").and_then(Object::as_reference) {
                if let Ok(root_obj) = doc.get_object_mut(root_id) {
                    if let Ok(dict) = root_obj.as_dict_mut() {
                        let _ = dict.remove(b"Metadata");
                    }
                }
            }
        }

        let pages_map = doc.get_pages();
        let pages = pages_map.len();
        let mut changed_images: usize = 0;

        let requested_fmt = args.format.unwrap_or_else(|| "jpeg".to_string()).to_lowercase();
        let jpeg_quality = args.quality.unwrap_or(82).clamp(1, 100);

        // 逐頁處理 XObject 影像（僅處理 Subtype=Image 且 ColorSpace=DeviceRGB/DeviceGray）
        for (_page_num, page_id) in pages_map {
            // 取得頁面資源字典
            let page_obj = doc
                .get_object(page_id)
                .map_err(|e| MediaError::new("parse_error", format!("讀取頁面失敗: {e}")))?;
            let page_dict = page_obj
                .as_dict()
                .map_err(|_| MediaError::new("parse_error", "頁面物件非字典"))?;
            let resources_obj = match page_dict.get(b"Resources") {
                Ok(o) => o.clone(),
                Err(_) => continue,
            };
            let resources_dict = match &resources_obj {
                Object::Reference(id) => doc
                    .get_object(*id)
                    .map_err(|e| MediaError::new("parse_error", format!("讀取 Resources 失敗: {e}")))?
                    .as_dict()
                    .map_err(|_| MediaError::new("parse_error", "Resources 非字典"))?
                    .clone(),
                Object::Dictionary(d) => d.clone(),
                _ => continue,
            };

            // 解析內容流，計算每個 XObject 名稱的顯示尺寸（pt）
            use lopdf::content::Content;
            let mut name_usage: HashMap<Vec<u8>, (f32, f32)> = HashMap::new();
            let content_bytes = doc
                .get_page_content(page_id)
                .map_err(|e| MediaError::new("parse_error", format!("讀取內容流失敗: {e}")))?;
            if let Ok(content) = Content::decode(&content_bytes) {
                // 簡易 CTM 追蹤
                let mut stack: Vec<[f32; 6]> = vec![[1.0, 0.0, 0.0, 1.0, 0.0, 0.0]];
                let mut cur = [1.0f32, 0.0, 0.0, 1.0, 0.0, 0.0];
                fn mul(m: [f32; 6], n: [f32; 6]) -> [f32; 6] {
                    let (a, b, c, d, e, f) = (m[0], m[1], m[2], m[3], m[4], m[5]);
                    let (a2, b2, c2, d2, e2, f2) = (n[0], n[1], n[2], n[3], n[4], n[5]);
                    [
                        a * a2 + b * c2,
                        a * b2 + b * d2,
                        c * a2 + d * c2,
                        c * b2 + d * d2,
                        e * a2 + f * c2 + e2,
                        e * b2 + f * d2 + f2,
                    ]
                }
                for op in content.operations {
                    match op.operator.as_str() {
                        "q" => { stack.push(cur); }
                        "Q" => { cur = stack.pop().unwrap_or([1.0,0.0,0.0,1.0,0.0,0.0]); }
                        "cm" => {
                            if op.operands.len() >= 6 {
                                let mut nums = [0f32;6];
                                for i in 0..6 {
                                    nums[i] = match &op.operands[i] {
                                        Object::Integer(v) => *v as f32,
                                        Object::Real(f) => *f as f32,
                                        _ => 0.0,
                                    };
                                }
                                let m = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
                                cur = mul(m, cur);
                            }
                        }
                        "Do" => {
                            if let Some(name_obj) = op.operands.get(0) {
                                if let Ok(n) = name_obj.as_name() {
                                    let w_pt = (cur[0]*cur[0] + cur[2]*cur[2]).sqrt();
                                    let h_pt = (cur[1]*cur[1] + cur[3]*cur[3]).sqrt();
                                    let entry = name_usage.entry(n.to_vec()).or_insert((0.0, 0.0));
                                    if w_pt > entry.0 { entry.0 = w_pt; }
                                    if h_pt > entry.1 { entry.1 = h_pt; }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }

            // XObject dict
            let xobj_dict_obj = match resources_dict.get(b"XObject") { Ok(o) => o, Err(_) => continue };
            let xobj_dict = match xobj_dict_obj {
                Object::Reference(id) => doc
                    .get_object(*id)
                    .map_err(|e| MediaError::new("parse_error", format!("讀取 XObject 失敗: {e}")))?
                    .as_dict()
                    .map_err(|_| MediaError::new("parse_error", "XObject 非字典"))?
                    .clone(),
                Object::Dictionary(d) => d.clone(),
                _ => continue,
            };

            for (name, maybe_ref) in xobj_dict.iter() {
                let obj_id = if let Object::Reference(id) = maybe_ref { *id } else { continue };
                // 只處理影像 XObject
                let is_image = {
                    if let Ok(obj) = doc.get_object(obj_id) {
                        if let Ok(stream) = obj.as_stream() {
                            match stream.dict.get(b"Subtype") {
                                Ok(Object::Name(n)) if n.as_slice() == b"Image" => true,
                                _ => false,
                            }
                        } else { false }
                    } else { false }
                };
                if !is_image { continue; }

                if requested_fmt != "jpeg" {
                    continue;
                }

                let (mut dyn_img, img_w_px, img_h_px) = {
                    let stream_obj = doc
                        .get_object(obj_id)
                        .map_err(|e| MediaError::new("parse_error", format!("讀取影像物件失敗: {e}")))?;
                    let stream_ro = match stream_obj.as_stream() {
                        Ok(s) => s,
                        Err(_) => continue,
                    };

                    let filters = stream_ro.filters().unwrap_or_default();
                    let has_dct = filters.iter().any(|f| f == "DCTDecode");
                    let flate_only = !has_dct && !filters.is_empty() && filters.iter().all(|f| f == "FlateDecode");

                    let mut width = stream_ro
                        .dict
                        .get(b"Width")
                        .ok()
                        .and_then(|o| o.as_i64().ok())
                        .and_then(|v| u32::try_from(v).ok())
                        .unwrap_or(0);
                    let mut height = stream_ro
                        .dict
                        .get(b"Height")
                        .ok()
                        .and_then(|o| o.as_i64().ok())
                        .and_then(|v| u32::try_from(v).ok())
                        .unwrap_or(0);

                    let decoded = if has_dct {
                        match image::load_from_memory(&stream_ro.content) {
                            Ok(img) => Some(img),
                            Err(err) => {
                                warn!("JPEG decode failed for XObject {:?}: {}", name, err);
                                None
                            }
                        }
                    } else if flate_only {
                        match decode_flate_image_stream(&doc, stream_ro) {
                            Some(img) => Some(img),
                            None => {
                                warn!("FlateDecode image skipped due to unsupported parameters");
                                None
                            }
                        }
                    } else {
                        None
                    };

                    let dyn_img = match decoded {
                        Some(img) => img,
                        None => continue,
                    };

                    if width == 0 {
                        width = dyn_img.width();
                    }
                    if height == 0 {
                        height = dyn_img.height();
                    }

                    (dyn_img, width, height)
                };

                // 頁面上此影像的顯示寬/高（pt）
                let (disp_w_pt, disp_h_pt) = name_usage.get(name).copied().unwrap_or((0.0, 0.0));
                let mut original_w = img_w_px;
                let mut original_h = img_h_px;
                if original_w == 0 {
                    original_w = dyn_img.width();
                }
                if original_h == 0 {
                    original_h = dyn_img.height();
                }

                if disp_w_pt > 0.0 && original_w > 0 {
                    let eff_dpi = (original_w as f32) * 72.0 / disp_w_pt.max(0.01);
                    if let Some(tgt_dpi) = args.target_effective_dpi {
                        let rule = args.downsample_rule.as_deref().unwrap_or("always");
                        let threshold = args.threshold_effective_dpi.unwrap_or(tgt_dpi);
                        let need = match rule {
                            "whenAbove" => eff_dpi >= threshold as f32,
                            _ => eff_dpi > tgt_dpi as f32,
                        };
                        if need {
                            use image::imageops::FilterType;
                            let target_w = ((disp_w_pt / 72.0) * tgt_dpi as f32).round().max(1.0) as u32;
                            let target_h = if disp_h_pt > 0.0 {
                                ((disp_h_pt / 72.0) * tgt_dpi as f32).round().max(1.0) as u32
                            } else {
                                (original_h as f32 * (target_w as f32 / original_w as f32))
                                    .round()
                                    .max(1.0) as u32
                            };
                            if target_w < original_w || target_h < original_h {
                                dyn_img = dyn_img.resize(target_w, target_h, FilterType::Triangle);
                            }
                        }
                    }
                }

                // 轉為 RGB8 並以 JPEG 輸出（無 alpha）
                use image::ColorType;
                let rgb = dyn_img.to_rgb8();
                let mut out: Vec<u8> = Vec::new();
                let enc =
                    image::codecs::jpeg::JpegEncoder::new_with_quality(Cursor::new(&mut out), jpeg_quality);
                if enc
                    .write_image(&rgb, rgb.width(), rgb.height(), ColorType::Rgb8.into())
                    .is_err()
                {
                    continue;
                }

                let stream_ref = doc
                    .get_object_mut(obj_id)
                    .map_err(|e| MediaError::new("parse_error", format!("讀取影像物件失敗: {e}")))?;
                let stream = match stream_ref.as_stream_mut() {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                stream.set_content(out);
                stream.dict.set(b"Filter", Object::Name(b"DCTDecode".to_vec()));
                let _ = stream.dict.remove(b"DecodeParms");
                stream.dict.set(b"ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
                stream.dict.set(b"BitsPerComponent", 8);
                stream.dict.set(b"Width", rgb.width() as i64);
                stream.dict.set(b"Height", rgb.height() as i64);
                changed_images += 1;
            }
        }

        // 無損結構最佳化（v1：重壓 Flate streams）
        if args.lossless_optimize.unwrap_or(true) {
            doc.compress();
        }

        // 保存
        doc.save(&args.dest_path)
            .map_err(|e| MediaError::new("io_error", format!("寫入 PDF 失敗: {e}")))?;

        let after_meta = fs::metadata(&args.dest_path)
            .map_err(|e| MediaError::new("io_error", format!("讀取輸出檔資訊失敗: {e}")))?;

        Ok(CompressPdfSmartResult {
            path: args.dest_path,
            before_size,
            after_size: after_meta.len(),
            pages,
            changed_images,
        })
    }).await.map_err(|e| MediaError::new("async_error", format!("異步任務失敗: {e}")))?
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

// Attempts to resolve a directory that contains the Pdfium library for the current platform.
// Strategy:
// 1) TAURI_RESOURCES_DIR env var
// 2) Resources next to the executable (macOS app bundle: ../Resources)
// 3) Development-time relative path: ./src-tauri/resources
fn resolve_pdfium_dir() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // Tauri sets TAURI_RESOURCES_DIR to point at the Resources dir in production.
    if let Ok(dir) = std::env::var("TAURI_RESOURCES_DIR") {
        let p = PathBuf::from(dir);
        candidates.push(p.clone());
        candidates.push(p.join("resources")); // nested variant
    }

    if let Ok(exe) = std::env::current_exe() {
        let exe_dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
        // macOS app bundle
        candidates.push(exe_dir.join("../Resources"));
        candidates.push(exe_dir.join("../Resources/resources"));
        // Windows/Linux packaged next to executable
        candidates.push(exe_dir.join("resources"));
        // Development fallback
        candidates.push(exe_dir.join("../../resources"));
    }

    // As a last resort, current_dir/src-tauri/resources
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("src-tauri/resources"));
    }

    for root in candidates {
        let base = root.join("pdfium");
        if base.exists() {
            return Some(root.canonicalize().unwrap_or(root));
        }
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
                        .map_err(|e| {
                            MediaError::new("parse_error", format!("PDFium 載入失敗: {e}"))
                        });
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
        reply: mpsc::Sender<Result<usize, MediaError>>,
    },
    DeletePages {
        doc_id: u64,
        indices: Vec<u32>,
        reply: mpsc::Sender<Result<usize, MediaError>>,
    },
    RotatePage {
        doc_id: u64,
        index: u32,
        rotate_deg: u16,
        reply: mpsc::Sender<Result<(), MediaError>>,
    },
    RotatePageRelative {
        doc_id: u64,
        index: u32,
        delta_deg: i16,
        reply: mpsc::Sender<Result<u16, MediaError>>,
    },
    CopyPage {
        src_doc_id: u64,
        src_index: u32,
        dest_doc_id: u64,
        dest_index: u32,
        reply: mpsc::Sender<Result<usize, MediaError>>,
    },
    Save {
        doc_id: u64,
        dest_path: Option<String>,
        overwrite: Option<bool>,
        reply: mpsc::Sender<Result<(String, usize), MediaError>>,
    },
    ImageToPdf {
        src_path: String,
        dest_path: String,
        reply: mpsc::Sender<Result<String, MediaError>>,
    },
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
                        let document = pdfium.load_pdf_from_file(&path, None).map_err(|e| {
                            MediaError::new("parse_error", format!("開啟 PDF 失敗: {e}"))
                        })?;
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
                        let doc = docs.get(&args.doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", args.doc_id))
                        })?;
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
                        let page = doc.pages().get(idx_u16).map_err(|_| {
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
                        let page = render_page_for_document(doc, &args)?;
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
                        // 建立新 PDF 並以向量方式複製該頁，不變更原文件
                        let mut new_doc = pdfium.create_new_pdf().map_err(|e| {
                            MediaError::new("io_error", format!("建立新 PDF 失敗: {e}"))
                        })?;
                        new_doc
                            .pages_mut()
                            .copy_page_from_document(doc, idx_u16, 0)
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
                    let res = (|| -> Result<usize, MediaError> {
                        let doc = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        let size = PdfPagePaperSize::Custom(
                            PdfPoints::new(width_pt),
                            PdfPoints::new(height_pt),
                        );
                        let idx_u16: u16 = index.try_into().map_err(|_| {
                            MediaError::new("invalid_input", format!("頁索引過大: {}", index))
                        })?;
                        doc.pages_mut()
                            .create_page_at_index(size, idx_u16)
                            .map_err(|e| {
                                MediaError::new("io_error", format!("插入空白頁失敗: {e}"))
                            })?;
                        Ok(doc.pages().len() as usize)
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::DeletePages {
                    doc_id,
                    mut indices,
                    reply,
                }) => {
                    let res = (|| -> Result<usize, MediaError> {
                        // 取出文件所有權以避免與 HashMap 的借用衝突
                        let old = docs.remove(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        let page_count = old.pages().len();
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
                        // 構建保留頁碼 spec（1-based, e.g. "1,3,5-7"）
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
                        let mut ranges: Vec<(u32, u32)> = Vec::new();
                        for p in pages_1 {
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
                        let mut new_doc = pdfium.create_new_pdf().map_err(|e| {
                            MediaError::new("io_error", format!("建立新 PDF 失敗: {e}"))
                        })?;
                        new_doc
                            .pages_mut()
                            .copy_pages_from_document(&old, &spec, 0)
                            .map_err(|e| {
                                MediaError::new("io_error", format!("複製頁面失敗: {e}"))
                            })?;
                        let pages_after = new_doc.pages().len() as usize;
                        // 替換文件
                        docs.insert(doc_id, new_doc);
                        Ok(pages_after)
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::RotatePage {
                    doc_id,
                    index,
                    rotate_deg,
                    reply,
                }) => {
                    let res = (|| -> Result<(), MediaError> {
                        use pdfium_render::prelude::*;
                        let doc = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
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
                        let mut page = doc.pages_mut().get(idx_u16).map_err(|_| {
                            MediaError::new("not_found", format!("頁索引不存在: {}", index))
                        })?;
                        page.set_rotation(rot);
                        Ok(())
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::RotatePageRelative {
                    doc_id,
                    index,
                    delta_deg,
                    reply,
                }) => {
                    let res = (|| -> Result<u16, MediaError> {
                        use pdfium_render::prelude::*;
                        let doc = docs.get_mut(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        let idx_u16: u16 = index.try_into().map_err(|_| {
                            MediaError::new("invalid_input", format!("頁索引過大: {}", index))
                        })?;
                        let mut page = doc.pages_mut().get(idx_u16).map_err(|_| {
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
                        // 規範到 0/90/180/270
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
                        Ok(match set_to {
                            PdfPageRenderRotation::None => 0,
                            PdfPageRenderRotation::Degrees90 => 90,
                            PdfPageRenderRotation::Degrees180 => 180,
                            PdfPageRenderRotation::Degrees270 => 270,
                        })
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
                    let res = (|| -> Result<usize, MediaError> {
                        if src_doc_id == dest_doc_id {
                            // 同文件複製：先取出文件所有權，避免 HashMap 借用衝突
                            let mut doc = docs.remove(&src_doc_id).ok_or_else(|| {
                                MediaError::new(
                                    "not_found",
                                    format!("未知的 docId: {}", src_doc_id),
                                )
                            })?;
                            // 用暫存文件承接來源頁，避免同時 &mut 與 & 的借用衝突
                            let mut tmp = pdfium.create_new_pdf().map_err(|e| {
                                MediaError::new("io_error", format!("建立暫存 PDF 失敗: {e}"))
                            })?;
                            let idx_src_u16: u16 = src_index.try_into().map_err(|_| {
                                MediaError::new(
                                    "invalid_input",
                                    format!("頁索引過大: {}", src_index),
                                )
                            })?;
                            {
                                let src_ref = &doc;
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
                            doc.pages_mut()
                                .copy_pages_from_document(&tmp, "1", idx_dest_u16)
                                .map_err(|e| {
                                    MediaError::new("io_error", format!("插入頁面失敗: {e}"))
                                })?;
                            let pages_after = doc.pages().len() as usize;
                            docs.insert(src_doc_id, doc);
                            Ok(pages_after)
                        } else {
                            // 跨文件：先取出目標文件以避免與來源借用衝突
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
                            let idx_dest_u16: u16 = dest_index.try_into().map_err(|_| {
                                MediaError::new(
                                    "invalid_input",
                                    format!("頁索引過大: {}", dest_index),
                                )
                            })?;
                            dest.pages_mut()
                                .copy_page_from_document(src, idx_src_u16, idx_dest_u16)
                                .map_err(|e| {
                                    MediaError::new("io_error", format!("複製頁面失敗: {e}"))
                                })?;
                            let pages_after = dest.pages().len() as usize;
                            docs.insert(dest_doc_id, dest);
                            Ok(pages_after)
                        }
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::Save {
                    doc_id,
                    dest_path,
                    overwrite,
                    reply,
                }) => {
                    let res = (|| -> Result<(String, usize), MediaError> {
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
                            (None, true) => paths.get(&doc_id).cloned().ok_or_else(|| {
                                MediaError::new(
                                    "invalid_input",
                                    "未提供 destPath，且無可覆蓋之原始路徑",
                                )
                            })?,
                            _ => {
                                return Err(MediaError::new(
                                    "invalid_input",
                                    "請提供 destPath 或設定 overwrite=true 以覆蓋原檔",
                                ));
                            }
                        };
                        let doc = docs.get(&doc_id).ok_or_else(|| {
                            MediaError::new("not_found", format!("未知的 docId: {}", doc_id))
                        })?;
                        doc.save_to_file(&dest).map_err(|e| {
                            MediaError::new("io_error", format!("寫入檔案失敗: {e}"))
                        })?;
                        paths.insert(doc_id, dest.clone());
                        let pages = doc.pages().len() as usize;
                        Ok((dest, pages))
                    })();
                    let _ = reply.send(res);
                }
                Ok(PdfRequest::ImageToPdf {
                    src_path,
                    dest_path,
                    reply,
                }) => {
                    let res = (|| -> Result<String, MediaError> {
                        let p = Path::new(&src_path);
                        if !p.exists() {
                            return Err(MediaError::new(
                                "not_found",
                                format!("圖片檔案不存在: {}", src_path),
                            ));
                        }

                        // 讀取圖片以取得尺寸
                        let bytes = fs::read(p).map_err(|e| {
                            MediaError::new("io_error", format!("讀取圖片失敗: {e}"))
                        })?;
                        let dyn_img = image::load_from_memory(&bytes).map_err(|e| {
                            MediaError::new("decode_error", format!("解碼圖片失敗: {e}"))
                        })?;
                        let (w_px, h_px) = GenericImageView::dimensions(&dyn_img);

                        // 經驗法則：以 72 DPI 對應 1 px = 1 pt，避免不必要縮放
                        let width_pt = w_px as f32;
                        let height_pt = h_px as f32;

                        let mut doc = pdfium.create_new_pdf().map_err(|e| {
                            MediaError::new("io_error", format!("建立 PDF 失敗: {e}"))
                        })?;

                        // 建立單一頁面
                        let size = PdfPagePaperSize::Custom(
                            PdfPoints::new(width_pt),
                            PdfPoints::new(height_pt),
                        );
                        let mut page =
                            doc.pages_mut().create_page_at_index(size, 0).map_err(|e| {
                                MediaError::new("io_error", format!("建立頁面失敗: {e}"))
                            })?;

                        // 在頁面上放置圖片，鋪滿整頁
                        {
                            let objects = page.objects_mut();
                            // 以 0,0 為左下角，指定輸出寬高為整頁
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
                            // create_image_object 已自動加入頁面物件集合，無需再 add
                        }

                        doc.save_to_file(&dest_path).map_err(|e| {
                            MediaError::new("io_error", format!("寫入 PDF 失敗: {e}"))
                        })?;
                        Ok(dest_path)
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

// 移除 pdf_info：請改用 pdf_open 的回傳或 pdf_page_size。

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOpenResult {
    pub doc_id: u64,
    pub pages: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPageSize {
    pub width_pt: f32,
    pub height_pt: f32,
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
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
        .send(PdfRequest::Render { args, reply: rtx })
        .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;
    rrx.recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

// ⚡ 新增：異步版本（真正並行渲染）
#[tauri::command]
pub async fn pdf_render_page_async(args: PdfRenderArgs) -> Result<PageRender, MediaError> {
    // 使用 Tokio 阻塞執行緒池，避免阻塞主執行緒
    tokio::task::spawn_blocking(move || -> Result<PageRender, MediaError> {
        // 複用現有的同步邏輯
        let (rtx, rrx) = mpsc::channel();
        WORKER_TX
            .lock()
            .unwrap()
            .as_ref()
            .ok_or_else(|| MediaError::new("io_error", "PDF worker 未初始化"))?
            .send(PdfRequest::Render { args, reply: rtx })
            .map_err(|e| MediaError::new("io_error", format!("worker 傳送失敗: {e}")))?;

        rrx.recv()
            .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))? // 加上 ? 展開
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

fn render_page_for_document(
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
        "raw" // ⚡ 新增：直接傳 raw RGBA bitmap
    } else if fmt == "webp" {
        "webp"
    } else if fmt == "jpeg" || fmt == "jpg" {
        "jpeg"
    } else {
        "png"
    };

    let mut buf: Vec<u8> = Vec::new();
    if out_fmt == "raw" {
        // ⚡ 直接傳 RGBA raw bytes（無需編碼）
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
        use image::ColorType;
        use image::codecs::png::{CompressionType, FilterType, PngEncoder};
        let rgba = img.to_rgba8();
        let comp = if args.quality.unwrap_or(100) <= 50 {
            CompressionType::Fast
        } else {
            CompressionType::Default
        };
        let enc = PngEncoder::new_with_quality(Cursor::new(&mut buf), comp, FilterType::NoFilter);
        enc.write_image(&rgba, rgba.width(), rgba.height(), ColorType::Rgba8.into())
            .map_err(|e| MediaError::new("io_error", format!("編碼 PNG 失敗: {e}")))?;
    } else if out_fmt == "jpeg" {
        use image::ColorType;
        use image::codecs::jpeg::JpegEncoder;
        // JPEG 不支援帶 alpha 的 RGBA；需轉為 RGB 並丟棄 alpha
        let rgb = img.to_rgb8();
        let enc = JpegEncoder::new_with_quality(Cursor::new(&mut buf), args.quality.unwrap_or(82));
        enc.write_image(&rgb, rgb.width(), rgb.height(), ColorType::Rgb8.into())
            .map_err(|e| MediaError::new("io_error", format!("編碼 JPEG 失敗: {e}")))?;
    } else {
        use image::ColorType;
        use image::codecs::png::{CompressionType, FilterType, PngEncoder};
        let rgba = img.to_rgba8();
        let enc = PngEncoder::new_with_quality(
            Cursor::new(&mut buf),
            CompressionType::Default,
            FilterType::NoFilter,
        );
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
pub struct PdfPagesResult {
    pub pages: usize,
}

// 儲存回傳：路徑與頁數
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSaveResult {
    pub path: String,
    pub pages: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportImageResult {
    pub path: String,
    pub width_px: u32,
    pub height_px: u32,
    pub format: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportPdfResult {
    pub path: String,
}

#[tauri::command]
pub fn pdf_insert_blank(
    doc_id: u64,
    index: u32,
    width_pt: f32,
    height_pt: f32,
) -> Result<PdfPagesResult, MediaError> {
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
    let pages = rrx
        .recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(PdfPagesResult { pages })
}

#[tauri::command]
pub fn pdf_delete_pages(doc_id: u64, indices: Vec<u32>) -> Result<PdfPagesResult, MediaError> {
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
    let pages = rrx
        .recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(PdfPagesResult { pages })
}

#[tauri::command]
pub fn pdf_rotate_page(doc_id: u64, index: u32, rotate_deg: u16) -> Result<(), MediaError> {
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
    rrx.recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(())
}

#[tauri::command]
pub fn pdf_rotate_page_relative(
    doc_id: u64,
    index: u32,
    delta_deg: i16,
) -> Result<u16, MediaError> {
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
    rrx.recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))?
}

#[tauri::command]
pub fn pdf_copy_page(
    src_doc_id: u64,
    src_index: u32,
    dest_doc_id: u64,
    dest_index: u32,
) -> Result<PdfPagesResult, MediaError> {
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
    let pages = rrx
        .recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(PdfPagesResult { pages })
}

#[tauri::command]
pub fn pdf_save(
    doc_id: u64,
    dest_path: Option<String>,
    overwrite: Option<bool>,
) -> Result<PdfSaveResult, MediaError> {
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
    let (path, pages) = rrx
        .recv()
        .map_err(|e| MediaError::new("io_error", format!("worker 回應失敗: {e}")))??;
    Ok(PdfSaveResult { path, pages })
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageReadResult {
    pub width: u32,
    pub height: u32,
    pub image_bytes: Vec<u8>,
    pub mime_type: String,
}

#[tauri::command]
pub fn image_read(path: String) -> Result<ImageReadResult, MediaError> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(MediaError::new(
            "not_found",
            format!("圖片檔案不存在: {}", path),
        ));
    }

    // 讀取圖片檔案
    let bytes =
        fs::read(p).map_err(|e| MediaError::new("io_error", format!("讀取圖片失敗: {e}")))?;

    // 使用 image crate 解碼圖片以取得寬高
    let img = image::load_from_memory(&bytes)
        .map_err(|e| MediaError::new("decode_error", format!("解碼圖片失敗: {e}")))?;

    let width = img.width();
    let height = img.height();

    // 推斷 MIME 類型
    let mime_type = match p
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
    .to_string();

    Ok(ImageReadResult {
        width,
        height,
        image_bytes: bytes,
        mime_type,
    })
}

#[tauri::command]
pub async fn image_to_pdf(src_path: String, dest_path: String) -> Result<String, MediaError> {
    // 使用 Tokio 阻塞執行緒池，避免阻塞主執行緒
    tokio::task::spawn_blocking(move || -> Result<String, MediaError> {
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
