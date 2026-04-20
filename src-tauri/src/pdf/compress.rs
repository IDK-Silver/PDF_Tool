//! PDF 壓縮功能
//!
//! 提供無損壓縮和智慧壓縮（JPEG 轉換、降低解析度）等功能。

use crate::error::MediaError;
use flate2::read::ZlibDecoder;
use image::ImageEncoder;
use log::warn;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Read};
use std::path::Path;

// =====================
// PDF Compression commands
// =====================

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
pub async fn compress_pdf_lossless(
    args: CompressPdfLosslessArgs,
) -> Result<CompressPdfLosslessResult, MediaError> {
    // 純 Rust v1 佔位：暫以安全複製檔案實作，之後將改為使用 pdf/pdf-writer 重寫結構與重壓 streams。
    tokio::task::spawn_blocking(move || -> Result<CompressPdfLosslessResult, MediaError> {
        let src = Path::new(&args.src_path);
        if !src.exists() {
            return Err(MediaError::new(
                "not_found",
                format!("來源檔案不存在: {}", args.src_path),
            ));
        }
        let before_meta = fs::metadata(src)
            .map_err(|e| MediaError::new("io_error", format!("讀取來源檔案資訊失敗: {e}")))?;
        let before_size = before_meta.len();

        // 若目標與來源相同，避免覆寫：回傳原檔資訊
        if args.dest_path == args.src_path {
            return Ok(CompressPdfLosslessResult {
                path: args.dest_path,
                before_size,
                after_size: before_size,
            });
        }

        // 直接複製（no-op 最小可行版本）
        fs::copy(&args.src_path, &args.dest_path)
            .map_err(|e| MediaError::new("io_error", format!("寫入輸出檔失敗: {e}")))?;
        let after_meta = fs::metadata(&args.dest_path)
            .map_err(|e| MediaError::new("io_error", format!("讀取輸出檔資訊失敗: {e}")))?;
        Ok(CompressPdfLosslessResult {
            path: args.dest_path,
            before_size,
            after_size: after_meta.len(),
        })
    })
    .await
    .map_err(|e| MediaError::new("async_error", format!("異步任務失敗: {e}")))?
}

// ------- v1 Smart compression (JPEG/Flate + basic structure optimize) -------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressPdfSmartArgs {
    pub src_path: String,
    pub dest_path: String,
    pub target_effective_dpi: Option<f32>,
    pub downsample_rule: Option<String>, // 'always' | 'whenAbove' （v1 暫不套用）
    pub threshold_effective_dpi: Option<f32>, // v1 暫不套用
    pub format: Option<String>,          // 'jpeg' | 'keep'
    pub quality: Option<u8>,             // 1-100（僅 JPEG 生效）
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

fn infer_color_space_kind(
    doc: &lopdf::Document,
    color_space: Option<lopdf::Object>,
) -> Option<PdfColorSpaceKind> {
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
                    lopdf::Object::Name(name) if name.as_slice() == b"CalRGB" => {
                        Some(PdfColorSpaceKind::Rgb)
                    }
                    lopdf::Object::Name(name) if name.as_slice() == b"CalGray" => {
                        Some(PdfColorSpaceKind::Gray)
                    }
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
pub async fn compress_pdf_smart(
    args: CompressPdfSmartArgs,
) -> Result<CompressPdfSmartResult, MediaError> {
    tokio::task::spawn_blocking(move || -> Result<CompressPdfSmartResult, MediaError> {
        use lopdf::{Document, Object};

        let src = Path::new(&args.src_path);
        if !src.exists() {
            return Err(MediaError::new(
                "not_found",
                format!("來源檔案不存在: {}", args.src_path),
            ));
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

        let requested_fmt = args
            .format
            .unwrap_or_else(|| "jpeg".to_string())
            .to_lowercase();
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
                    .map_err(|e| {
                        MediaError::new("parse_error", format!("讀取 Resources 失敗: {e}"))
                    })?
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
                        "q" => {
                            stack.push(cur);
                        }
                        "Q" => {
                            cur = stack.pop().unwrap_or([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
                        }
                        "cm" => {
                            if op.operands.len() >= 6 {
                                let mut nums = [0f32; 6];
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
                            if let Some(name_obj) = op.operands.first() {
                                if let Ok(n) = name_obj.as_name() {
                                    let w_pt = (cur[0] * cur[0] + cur[2] * cur[2]).sqrt();
                                    let h_pt = (cur[1] * cur[1] + cur[3] * cur[3]).sqrt();
                                    let entry = name_usage.entry(n.to_vec()).or_insert((0.0, 0.0));
                                    if w_pt > entry.0 {
                                        entry.0 = w_pt;
                                    }
                                    if h_pt > entry.1 {
                                        entry.1 = h_pt;
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }

            // XObject dict
            let xobj_dict_obj = match resources_dict.get(b"XObject") {
                Ok(o) => o,
                Err(_) => continue,
            };
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
                let obj_id = if let Object::Reference(id) = maybe_ref {
                    *id
                } else {
                    continue;
                };
                // 只處理影像 XObject
                let is_image = {
                    if let Ok(obj) = doc.get_object(obj_id) {
                        if let Ok(stream) = obj.as_stream() {
                            match stream.dict.get(b"Subtype") {
                                Ok(Object::Name(n)) if n.as_slice() == b"Image" => true,
                                _ => false,
                            }
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                };
                if !is_image {
                    continue;
                }

                if requested_fmt != "jpeg" {
                    continue;
                }

                let (mut dyn_img, img_w_px, img_h_px) = {
                    let stream_obj = doc.get_object(obj_id).map_err(|e| {
                        MediaError::new("parse_error", format!("讀取影像物件失敗: {e}"))
                    })?;
                    let stream_ro = match stream_obj.as_stream() {
                        Ok(s) => s,
                        Err(_) => continue,
                    };

                    let filters = stream_ro.filters().unwrap_or_default();
                    let has_dct = filters.iter().any(|f| f == "DCTDecode");
                    let flate_only = !has_dct
                        && !filters.is_empty()
                        && filters.iter().all(|f| f == "FlateDecode");

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
                            "whenAbove" => eff_dpi >= threshold,
                            _ => eff_dpi > tgt_dpi,
                        };
                        if need {
                            use image::imageops::FilterType;
                            let target_w = ((disp_w_pt / 72.0) * tgt_dpi).round().max(1.0) as u32;
                            let target_h = if disp_h_pt > 0.0 {
                                ((disp_h_pt / 72.0) * tgt_dpi).round().max(1.0) as u32
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
                let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(
                    Cursor::new(&mut out),
                    jpeg_quality,
                );
                if enc
                    .write_image(&rgb, rgb.width(), rgb.height(), ColorType::Rgb8.into())
                    .is_err()
                {
                    continue;
                }

                let stream_ref = doc.get_object_mut(obj_id).map_err(|e| {
                    MediaError::new("parse_error", format!("讀取影像物件失敗: {e}"))
                })?;
                let stream = match stream_ref.as_stream_mut() {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                stream.set_content(out);
                stream
                    .dict
                    .set(b"Filter", Object::Name(b"DCTDecode".to_vec()));
                let _ = stream.dict.remove(b"DecodeParms");
                stream
                    .dict
                    .set(b"ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
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
    })
    .await
    .map_err(|e| MediaError::new("async_error", format!("異步任務失敗: {e}")))?
}
