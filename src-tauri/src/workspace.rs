use crate::error::AppError;
use crate::workspace_cache::{
    WorkspaceImageCacheKey, get_cached_workspace_image, put_cached_workspace_image,
};
use image::{ColorType, ImageEncoder, ImageReader, Rgba, RgbaImage, imageops};
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Instant, UNIX_EPOCH};

#[derive(Serialize)]
pub struct WorkspaceFileEntry {
    pub path: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMoveFileArgs {
    pub src_path: String,
    pub dest_dir: String,
    pub overwrite: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMoveFileResult {
    pub path: String,
    pub overwritten: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExportImagesArgs {
    pub left_path: String,
    pub right_path: String,
    pub left_target_width_px: u32,
    pub right_target_width_px: u32,
    pub dest_path: String,
    pub gap_px: Option<u32>,
    pub format: Option<String>, // "png" | "jpeg" | "webp", defaults to png
    pub quality: Option<u8>,    // 1-100, used for jpeg/webp
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExportImagesResult {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub size: u64,
    pub format: String,
}

struct PreparedWorkspaceImage {
    image: RgbaImage,
    source_width: u32,
    source_height: u32,
    output_width: u32,
    output_height: u32,
    cache_status: &'static str,
    cache_lookup_ms: u128,
    cache_write_ms: u128,
    decoded_ms: u128,
    resized_ms: u128,
    resize_method: &'static str,
}

const WORKSPACE_RESIZE_METHOD: &str = "lanczos3";

fn infer_kind(path: &Path) -> Option<&'static str> {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())?;

    match ext.as_str() {
        "pdf" => Some("pdf"),
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "tiff" | "tif" => Some("image"),
        _ => None,
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string()
}

#[tauri::command]
pub fn workspace_list_media_files(
    folder_path: String,
) -> Result<Vec<WorkspaceFileEntry>, AppError> {
    let root = Path::new(&folder_path);
    if !root.exists() {
        return Err(AppError::not_found(format!("資料夾不存在: {folder_path}")));
    }
    if !root.is_dir() {
        return Err(AppError::invalid_input(format!(
            "不是資料夾: {folder_path}"
        )));
    }

    let mut entries: Vec<WorkspaceFileEntry> = fs::read_dir(root)
        .map_err(|e| AppError::io_error(format!("讀取資料夾失敗: {e}")))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter_map(|path| {
            let kind = infer_kind(&path)?;
            Some(WorkspaceFileEntry {
                path: path.to_string_lossy().to_string(),
                name: file_name(&path),
                kind: kind.to_string(),
            })
        })
        .collect();

    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

fn copy_then_remove(src: &Path, dest: &Path) -> Result<(), AppError> {
    fs::copy(src, dest).map_err(|e| AppError::io_error(format!("複製檔案失敗: {e}")))?;
    fs::remove_file(src).map_err(|e| AppError::io_error(format!("刪除來源檔案失敗: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn workspace_move_file(
    args: WorkspaceMoveFileArgs,
) -> Result<WorkspaceMoveFileResult, AppError> {
    let src = PathBuf::from(&args.src_path);
    if !src.exists() {
        return Err(AppError::not_found(format!(
            "來源檔案不存在: {}",
            args.src_path
        )));
    }
    if !src.is_file() {
        return Err(AppError::invalid_input(format!(
            "來源不是檔案: {}",
            args.src_path
        )));
    }

    let dest_dir = PathBuf::from(&args.dest_dir);
    if !dest_dir.exists() {
        return Err(AppError::not_found(format!(
            "目標資料夾不存在: {}",
            args.dest_dir
        )));
    }
    if !dest_dir.is_dir() {
        return Err(AppError::invalid_input(format!(
            "目標不是資料夾: {}",
            args.dest_dir
        )));
    }

    let name = src
        .file_name()
        .ok_or_else(|| AppError::invalid_input("來源檔名無效"))?;
    let dest = dest_dir.join(name);

    let overwrite = args.overwrite.unwrap_or(false);
    let overwritten = dest.exists();
    if overwritten && !overwrite {
        return Err(AppError::new(
            "target_exists",
            format!("目標檔案已存在: {}", dest.to_string_lossy()),
        ));
    }

    if overwritten {
        fs::remove_file(&dest)
            .map_err(|e| AppError::io_error(format!("移除既有目標檔失敗: {e}")))?;
    }

    match fs::rename(&src, &dest) {
        Ok(_) => {}
        Err(_) => copy_then_remove(&src, &dest)?,
    }

    Ok(WorkspaceMoveFileResult {
        path: dest.to_string_lossy().to_string(),
        overwritten,
    })
}

#[tauri::command]
pub fn workspace_delete_file(path: String) -> Result<(), AppError> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(AppError::not_found(format!("檔案不存在: {path}")));
    }
    if !target.is_file() {
        return Err(AppError::invalid_input(format!("不是檔案: {path}")));
    }

    move_to_trash(&target)?;
    Ok(())
}

#[tauri::command]
pub async fn workspace_export_images(
    args: WorkspaceExportImagesArgs,
) -> Result<WorkspaceExportImagesResult, AppError> {
    tokio::task::spawn_blocking(move || workspace_export_images_sync(args))
        .await
        .map_err(|e| AppError::async_error(format!("異步任務失敗: {e}")))?
}

fn workspace_export_images_sync(
    args: WorkspaceExportImagesArgs,
) -> Result<WorkspaceExportImagesResult, AppError> {
    let total_started = Instant::now();
    let format = normalize_export_format(args.format.as_deref());
    let quality = args.quality.unwrap_or(90).clamp(1, 100);

    let left_path = args.left_path;
    let right_path = args.right_path;
    let left_target_width = args.left_target_width_px;
    let right_target_width = args.right_target_width_px;

    let (left_resized, right_resized) = std::thread::scope(|scope| {
        let left_handle =
            scope.spawn(|| read_and_resize_image_for_workspace(&left_path, left_target_width));
        let right_handle =
            scope.spawn(|| read_and_resize_image_for_workspace(&right_path, right_target_width));

        let left_resized = left_handle
            .join()
            .map_err(|_| AppError::async_error("左側圖片處理失敗"))??;
        let right_resized = right_handle
            .join()
            .map_err(|_| AppError::async_error("右側圖片處理失敗"))??;

        Ok::<(PreparedWorkspaceImage, PreparedWorkspaceImage), AppError>((
            left_resized,
            right_resized,
        ))
    })?;
    let gap = args.gap_px.unwrap_or(12);
    let prepare_ms = total_started.elapsed().as_millis();

    info!(
        "[workspace] export start format={} quality={} gap={} left_target={} right_target={} left_path={} right_path={}",
        format,
        quality,
        gap,
        left_target_width,
        right_target_width,
        left_path,
        right_path
    );
    info!(
        "[workspace] export prepared left src={}x{} out={}x{} cache_status={} cache_lookup_ms={} cache_write_ms={} decoded_ms={} resized_ms={} resize_method={}",
        left_resized.source_width,
        left_resized.source_height,
        left_resized.output_width,
        left_resized.output_height,
        left_resized.cache_status,
        left_resized.cache_lookup_ms,
        left_resized.cache_write_ms,
        left_resized.decoded_ms,
        left_resized.resized_ms,
        left_resized.resize_method
    );
    info!(
        "[workspace] export prepared right src={}x{} out={}x{} cache_status={} cache_lookup_ms={} cache_write_ms={} decoded_ms={} resized_ms={} resize_method={}",
        right_resized.source_width,
        right_resized.source_height,
        right_resized.output_width,
        right_resized.output_height,
        right_resized.cache_status,
        right_resized.cache_lookup_ms,
        right_resized.cache_write_ms,
        right_resized.decoded_ms,
        right_resized.resized_ms,
        right_resized.resize_method
    );

    let compose_started = Instant::now();
    let out_width = left_resized.image.width() + right_resized.image.width() + gap;
    let out_height = left_resized.image.height().max(right_resized.image.height());
    let left_y = (out_height.saturating_sub(left_resized.image.height())) / 2;
    let right_y = (out_height.saturating_sub(right_resized.image.height())) / 2;

    // JPEG has no alpha; use white background to avoid black fill on transparent pixels.
    let background = if format == "jpeg" {
        Rgba([255, 255, 255, 255])
    } else {
        Rgba([0, 0, 0, 0])
    };
    let mut canvas = RgbaImage::from_pixel(out_width, out_height, background);
    imageops::overlay(&mut canvas, &left_resized.image, 0, i64::from(left_y));
    imageops::overlay(
        &mut canvas,
        &right_resized.image,
        i64::from(left_resized.image.width() + gap),
        i64::from(right_y),
    );
    let compose_ms = compose_started.elapsed().as_millis();

    let encode_started = Instant::now();
    let dest = PathBuf::from(&args.dest_path);
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::io_error(format!("建立輸出資料夾失敗: {e}")))?;
        }
    }
    encode_canvas_to_path(&canvas, &format, quality, &dest)?;
    let encode_ms = encode_started.elapsed().as_millis();

    let meta = fs::metadata(&dest)
        .map_err(|e| AppError::io_error(format!("讀取檔案資訊失敗: {e}")))?;
    let total_ms = total_started.elapsed().as_millis();

    info!(
        "[workspace] export done out={}x{} size={} format={} prepare_ms={} compose_ms={} encode_ms={} total_ms={}",
        out_width,
        out_height,
        meta.len(),
        format,
        prepare_ms,
        compose_ms,
        encode_ms,
        total_ms
    );

    Ok(WorkspaceExportImagesResult {
        path: dest.to_string_lossy().to_string(),
        width: out_width,
        height: out_height,
        size: meta.len(),
        format,
    })
}

fn normalize_export_format(input: Option<&str>) -> String {
    match input.map(|s| s.to_ascii_lowercase()).as_deref() {
        Some("jpeg") | Some("jpg") => "jpeg".to_string(),
        Some("webp") => "webp".to_string(),
        _ => "png".to_string(),
    }
}

fn encode_canvas_to_path(
    canvas: &RgbaImage,
    format: &str,
    quality: u8,
    dest: &Path,
) -> Result<(), AppError> {
    let width = canvas.width();
    let height = canvas.height();
    match format {
        "jpeg" => {
            let rgb = rgba_to_rgb_bytes(canvas);
            let file = fs::File::create(dest)
                .map_err(|e| AppError::io_error(format!("建立輸出檔案失敗: {e}")))?;
            let mut writer = BufWriter::new(file);
            let encoder =
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, quality);
            encoder
                .write_image(&rgb, width, height, ColorType::Rgb8.into())
                .map_err(|e| AppError::encode_error(format!("JPEG 編碼失敗: {e}")))?;
        }
        "webp" => {
            let encoder = webp::Encoder::from_rgba(canvas.as_raw(), width, height);
            let encoded = encoder.encode(quality as f32);
            fs::write(dest, encoded.to_vec())
                .map_err(|e| AppError::io_error(format!("寫入 WebP 圖片失敗: {e}")))?;
        }
        _ => {
            let file = fs::File::create(dest)
                .map_err(|e| AppError::io_error(format!("建立輸出檔案失敗: {e}")))?;
            let mut writer = BufWriter::new(file);
            let encoder = image::codecs::png::PngEncoder::new_with_quality(
                &mut writer,
                image::codecs::png::CompressionType::Fast,
                image::codecs::png::FilterType::NoFilter,
            );
            encoder
                .write_image(canvas, width, height, ColorType::Rgba8.into())
                .map_err(|e| AppError::encode_error(format!("PNG 編碼失敗: {e}")))?;
        }
    }
    Ok(())
}

fn read_image_for_workspace(path: &str) -> Result<image::DynamicImage, AppError> {
    let target = Path::new(path);
    if !target.exists() {
        return Err(AppError::not_found(format!("圖片檔案不存在: {path}")));
    }

    ImageReader::open(target)
        .map_err(|e| AppError::io_error(format!("開啟圖片失敗: {e}")))?
        .with_guessed_format()
        .map_err(|e| AppError::decode_error(format!("辨識圖片格式失敗: {e}")))?
        .decode()
        .map_err(|e| AppError::decode_error(format!("解碼圖片失敗: {e}")))
}

fn read_and_resize_image_for_workspace(
    path: &str,
    target_width: u32,
) -> Result<PreparedWorkspaceImage, AppError> {
    let cache_key = workspace_cache_key(path, target_width, WORKSPACE_RESIZE_METHOD);
    let cache_lookup_started = Instant::now();
    if let Some(key) = cache_key.as_ref() {
        match get_cached_workspace_image(key) {
            Ok(Some(cached)) => {
                let cache_lookup_ms = cache_lookup_started.elapsed().as_millis();
                return Ok(PreparedWorkspaceImage {
                    output_width: cached.image.width(),
                    output_height: cached.image.height(),
                    source_width: cached.source_width,
                    source_height: cached.source_height,
                    cache_status: "hit",
                    cache_lookup_ms,
                    cache_write_ms: 0,
                    decoded_ms: 0,
                    resized_ms: 0,
                    resize_method: WORKSPACE_RESIZE_METHOD,
                    image: cached.image,
                });
            }
            Ok(None) => {}
            Err(err) => warn!("[workspace] cache read failed path={}: {}", path, err),
        }
    }
    let cache_lookup_ms = cache_lookup_started.elapsed().as_millis();

    let decode_started = Instant::now();
    let image = read_image_for_workspace(path)?;
    let decoded_ms = decode_started.elapsed().as_millis();
    let source_width = image.width();
    let source_height = image.height();

    let resize_started = Instant::now();
    let (resize_method, output) = resize_to_width(image, target_width)?;
    let resized_ms = resize_started.elapsed().as_millis();
    let cache_write_started = Instant::now();
    let cache_write_ms = if let Some(key) = cache_key.as_ref() {
        match put_cached_workspace_image(key, source_width, source_height, &output) {
            Ok(()) => cache_write_started.elapsed().as_millis(),
            Err(err) => {
                warn!("[workspace] cache write failed path={}: {}", path, err);
                0
            }
        }
    } else {
        0
    };

    Ok(PreparedWorkspaceImage {
        source_width,
        source_height,
        output_width: output.width(),
        output_height: output.height(),
        cache_status: "miss",
        cache_lookup_ms,
        cache_write_ms,
        decoded_ms,
        resized_ms,
        resize_method,
        image: output,
    })
}

fn workspace_cache_key(
    path: &str,
    target_width: u32,
    resize_method: &'static str,
) -> Option<WorkspaceImageCacheKey> {
    let meta = fs::metadata(path).ok()?;
    let modified_ns = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_nanos();

    let modified_ns = i64::try_from(modified_ns).ok()?;
    Some(WorkspaceImageCacheKey {
        path: path.to_string(),
        file_size: meta.len(),
        modified_ns,
        target_width,
        resize_method,
    })
}

fn rgba_to_rgb_bytes(canvas: &RgbaImage) -> Vec<u8> {
    let raw = canvas.as_raw();
    let mut rgb = Vec::with_capacity(raw.len() / 4 * 3);
    for chunk in raw.chunks_exact(4) {
        rgb.extend_from_slice(&chunk[..3]);
    }
    rgb
}

fn resize_to_width(
    image: image::DynamicImage,
    target_width: u32,
) -> Result<(&'static str, RgbaImage), AppError> {
    let width = image.width();
    let height = image.height();
    if width == 0 || height == 0 {
        return Err(AppError::invalid_input("圖片尺寸無效"));
    }

    let clamped_width = target_width.max(1);
    let target_height = ((height as f64 * clamped_width as f64) / width as f64).round() as u32;
    Ok((
        WORKSPACE_RESIZE_METHOD,
        image
        .resize_exact(
            clamped_width,
            target_height.max(1),
            imageops::FilterType::Lanczos3,
        )
        .to_rgba8(),
    ))
}

fn run_command(program: &str, args: &[&str]) -> Result<(), AppError> {
    let status = Command::new(program)
        .args(args)
        .status()
        .map_err(|e| AppError::io_error(format!("執行 {program} 失敗: {e}")))?;

    if !status.success() {
        return Err(AppError::io_error(format!(
            "{program} 執行失敗，狀態碼: {status}"
        )));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn move_to_trash(path: &Path) -> Result<(), AppError> {
    let quoted = path
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"");
    let script = format!("tell application \"Finder\" to delete POSIX file \"{quoted}\"");
    run_command("osascript", &["-e", &script])
}

#[cfg(target_os = "windows")]
fn move_to_trash(path: &Path) -> Result<(), AppError> {
    let escaped = path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('{escaped}','OnlyErrorDialogs','SendToRecycleBin')"
    );
    run_command("powershell", &["-NoProfile", "-Command", &script])
}

#[cfg(all(unix, not(target_os = "macos")))]
fn move_to_trash(path: &Path) -> Result<(), AppError> {
    let Some(value) = path.to_str() else {
        return Err(AppError::invalid_input("路徑不是有效 UTF-8"));
    };
    run_command("gio", &["trash", value])
}
