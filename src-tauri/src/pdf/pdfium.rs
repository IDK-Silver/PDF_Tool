//! PDFium 動態庫載入
//!
//! 負責定位和載入 PDFium 動態庫。

use crate::error::MediaError;
use std::fs;
use std::path::PathBuf;

/// 解析 PDFium 動態庫所在目錄
///
/// 策略:
/// 1) TAURI_RESOURCES_DIR 環境變數
/// 2) 可執行檔旁邊的 Resources（macOS app bundle: ../Resources）
/// 3) 開發時期的相對路徑: ./src-tauri/resources
pub fn resolve_pdfium_dir() -> Option<PathBuf> {
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

/// 取得 PDFium 實例
///
/// 會自動搜尋並載入對應平台的 PDFium 動態庫。
pub fn get_pdfium() -> Result<pdfium_render::prelude::Pdfium, MediaError> {
    use pdfium_render::prelude::*;

    let Some(res_dir) = resolve_pdfium_dir() else {
        return Err(MediaError::new(
            "not_found",
            "找不到 PDFium 動態庫，請先執行 npm run pdfium:fetch 並重新啟動應用。",
        ));
    };

    let base = res_dir.join("pdfium");
    let mut tried: Vec<String> = Vec::new();

    // 優先嘗試匹配當前架構的動態庫
    // NOTE: Must check OS first, then arch. Otherwise x86_64 matches darwin before linux.
    let current_arch = if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "aarch64-apple-darwin"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "x86_64") {
        "x86_64-apple-darwin"
    } else if cfg!(target_os = "windows") && cfg!(target_arch = "x86_64") {
        "x86_64-pc-windows-msvc"
    } else if cfg!(target_os = "windows") && cfg!(target_arch = "aarch64") {
        "aarch64-pc-windows-msvc"
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "x86_64") {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "aarch64") {
        "aarch64-unknown-linux-gnu"
    } else {
        ""
    };

    // 先嘗試當前架構
    if !current_arch.is_empty() {
        let dir = base.join(current_arch);
        if dir.exists() {
            let lib_path = Pdfium::pdfium_platform_library_name_at_path(&dir);
            tried.push(format!("{} (current arch)", lib_path.to_string_lossy()));
            if lib_path.exists() {
                return Pdfium::bind_to_library(&lib_path)
                    .map(Pdfium::new)
                    .map_err(|e| {
                        MediaError::new(
                            "parse_error",
                            format!("PDFium 載入失敗 ({}): {e}", current_arch),
                        )
                    });
            }
        }
    }

    // 如果當前架構不存在，再嘗試其他架構（fallback）
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
