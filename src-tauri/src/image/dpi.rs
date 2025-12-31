//! 圖像 DPI 檢測工具
//!
//! 從 PNG 和 JPEG 檔案中提取 DPI 資訊。

use std::io::Cursor;

/// 從圖像位元組中提取 DPI 資訊
///
/// 支援 PNG (pHYs chunk) 和 JPEG (JFIF header) 格式。
/// 其他格式回傳 None。
pub fn image_dpi_from_bytes(bytes: &[u8]) -> Option<f32> {
    const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    if bytes.starts_with(&PNG_SIGNATURE) {
        return png_dpi_from_bytes(bytes);
    }
    if bytes.starts_with(&[0xFF, 0xD8]) {
        return jpeg_dpi_from_bytes(bytes);
    }
    None
}

/// 從 PNG 檔案的 pHYs chunk 提取 DPI
fn png_dpi_from_bytes(bytes: &[u8]) -> Option<f32> {
    let decoder = png::Decoder::new(Cursor::new(bytes));
    let reader = decoder.read_info().ok()?;
    let info = reader.info();
    let dims = info.pixel_dims?;
    if dims.unit != png::Unit::Meter {
        return None;
    }
    let x = dims.xppu;
    let y = dims.yppu;
    let ppm = if x > 0 && y > 0 {
        (x as f32 + y as f32) / 2.0
    } else if x > 0 {
        x as f32
    } else if y > 0 {
        y as f32
    } else {
        return None;
    };
    // 1 inch = 0.0254 meters, so 1 meter = 39.3701 inches
    let dpi = ppm / 39.3701_f32;
    if dpi.is_finite() && dpi > 0.0 {
        Some(dpi)
    } else {
        None
    }
}

/// 從 JPEG 檔案的 JFIF header 提取 DPI
///
/// JFIF 頭部結構（從 FF D8 開始）：
/// - [0-1] FF D8 (SOI)
/// - [2-3] FF E0 (APP0 marker)
/// - [4-5] 長度
/// - [6-10] "JFIF\0"
/// - [11-12] 版本
/// - [13] 單位 (00=無單位, 01=DPI, 02=DPCM)
/// - [14-15] X 密度 (big-endian)
/// - [16-17] Y 密度 (big-endian)
fn jpeg_dpi_from_bytes(bytes: &[u8]) -> Option<f32> {
    if bytes.len() < 18 {
        return None;
    }
    if bytes[0] != 0xFF || bytes[1] != 0xD8 || bytes[2] != 0xFF || bytes[3] != 0xE0 {
        return None;
    }
    if &bytes[6..11] != b"JFIF\0" {
        return None;
    }
    let unit = bytes[13];
    let x = u16::from_be_bytes([bytes[14], bytes[15]]);
    let y = u16::from_be_bytes([bytes[16], bytes[17]]);
    let density = if x > 0 { x } else { y };
    if density == 0 {
        return None;
    }
    match unit {
        1 => Some(density as f32),                // DPI
        2 => Some(density as f32 * 2.54),         // DPCM → DPI
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_non_image_returns_none() {
        let data = b"not an image";
        assert!(image_dpi_from_bytes(data).is_none());
    }
}
