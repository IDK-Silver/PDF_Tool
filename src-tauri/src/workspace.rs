use crate::error::AppError;
use image::{ImageFormat, ImageReader, Rgba, RgbaImage, imageops};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExportImagesResult {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub size: u64,
}

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
    let left = read_image_for_workspace(&args.left_path)?;
    let right = read_image_for_workspace(&args.right_path)?;

    let left_resized = resize_to_width(left, args.left_target_width_px)?;
    let right_resized = resize_to_width(right, args.right_target_width_px)?;
    let gap = args.gap_px.unwrap_or(12);

    let out_width = left_resized.width() + right_resized.width() + gap;
    let out_height = left_resized.height().max(right_resized.height());
    let left_y = (out_height.saturating_sub(left_resized.height())) / 2;
    let right_y = (out_height.saturating_sub(right_resized.height())) / 2;

    let mut canvas = RgbaImage::from_pixel(out_width, out_height, Rgba([0, 0, 0, 0]));
    imageops::overlay(&mut canvas, &left_resized, 0, i64::from(left_y));
    imageops::overlay(
        &mut canvas,
        &right_resized,
        i64::from(left_resized.width() + gap),
        i64::from(right_y),
    );

    let dest = PathBuf::from(&args.dest_path);
    image::DynamicImage::ImageRgba8(canvas)
        .save_with_format(&dest, ImageFormat::Png)
        .map_err(|e| AppError::io_error(format!("寫入合成圖片失敗: {e}")))?;

    let meta = fs::metadata(&dest)
        .map_err(|e| AppError::io_error(format!("讀取檔案資訊失敗: {e}")))?;

    Ok(WorkspaceExportImagesResult {
        path: dest.to_string_lossy().to_string(),
        width: out_width,
        height: out_height,
        size: meta.len(),
    })
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

fn resize_to_width(
    image: image::DynamicImage,
    target_width: u32,
) -> Result<RgbaImage, AppError> {
    let width = image.width();
    let height = image.height();
    if width == 0 || height == 0 {
        return Err(AppError::invalid_input("圖片尺寸無效"));
    }

    let clamped_width = target_width.max(1);
    let target_height = ((height as f64 * clamped_width as f64) / width as f64).round() as u32;
    Ok(image
        .resize_exact(
            clamped_width,
            target_height.max(1),
            imageops::FilterType::Lanczos3,
        )
        .to_rgba8())
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
