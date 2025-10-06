use serde::{Deserialize, Serialize};
use std::io::Cursor;
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

#[derive(Serialize)]
pub struct PdfInfo {
    pub pages: usize,
}

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

#[tauri::command]
pub fn pdf_info(path: String) -> Result<PdfInfo, MediaError> {
    use pdfium_render::prelude::*;
    let pdfium = get_pdfium()?;
    let document = pdfium
        .load_pdf_from_file(&path, None)
        .map_err(|e| MediaError::new("parse_error", format!("開啟 PDF 失敗: {e}")))?;
    let pages = document.pages().len() as usize;
    Ok(PdfInfo { pages })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfRenderArgs {
    pub path: String,
    #[serde(alias = "page_index")]
    pub page_index: u32,
    #[serde(alias = "rotate_deg")]
    pub rotate_deg: Option<u16>,
    pub scale: Option<f32>,
    pub dpi: Option<f32>,
    pub format: Option<String>,
}

#[tauri::command]
pub fn pdf_render_page(args: PdfRenderArgs) -> Result<PageRender, MediaError> {
    use pdfium_render::prelude::*;

    let pdfium = get_pdfium()?;

    let document = pdfium
        .load_pdf_from_file(&args.path, None)
        .map_err(|e| MediaError::new("parse_error", format!("開啟 PDF 失敗: {e}")))?;

    let page_index_u16: u16 = args
        .page_index
        .try_into()
        .map_err(|_| MediaError::new("invalid_input", format!("頁索引過大: {}", args.page_index)))?;

    let page = document
        .pages()
        .get(page_index_u16)
        .map_err(|_| MediaError::new("not_found", format!("頁索引不存在: {}", args.page_index)))?;

    let mut cfg = PdfRenderConfig::new();

    let rotation = match args.rotate_deg.unwrap_or(0) {
        90 => PdfPageRenderRotation::Degrees90,
        180 => PdfPageRenderRotation::Degrees180,
        270 => PdfPageRenderRotation::Degrees270,
        _ => PdfPageRenderRotation::None,
    };
    cfg = cfg.rotate(rotation, true);

    if let Some(dpi_val) = args.dpi {
        let w_pt = page.width().value as f32;
        let width_px = ((w_pt * dpi_val / 72.0).ceil() as u32).max(1);
        let width_px_i32 = i32::try_from(width_px).unwrap_or(i32::MAX);
        cfg = cfg.set_target_width(width_px_i32);
    } else {
        let base = 1600.0_f32;
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
        .unwrap_or_else(|| "png".to_string())
        .to_lowercase();
    let out_fmt = if fmt == "webp" { "webp" } else { "png" };

    let mut buf: Vec<u8> = Vec::new();
    if out_fmt == "png" {
        img.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
            .map_err(|e| MediaError::new("io_error", format!("編碼 PNG 失敗: {e}")))?;
    } else {
        // 簡化：若需 webp，暫時回退 PNG 以避免缺少編碼器
        img.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
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
