use tauri::{Emitter, Manager};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::path::PathBuf;
use log::{info, debug, warn, error};

// 改用隊列來儲存待處理的檔案
static PENDING_FILES: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());
static FRONTEND_READY: AtomicBool = AtomicBool::new(false);

fn push_pending<I: IntoIterator<Item = PathBuf>>(iter: I) {
    let mut queue = PENDING_FILES.lock().unwrap();
    for path in iter {
        // 避免重複添加相同路徑的檔案
        if !queue.iter().any(|existing| existing == &path) {
            queue.push(path);
        }
    }
}

fn drain_pending() -> Vec<PathBuf> {
    let mut queue = PENDING_FILES.lock().unwrap();
    std::mem::take(&mut *queue)
}

// 只有「前端已就緒 + 視窗存在」時才會清空佇列並 emit
fn try_emit_pending_files(app: &tauri::AppHandle) {
    debug!("try_emit_pending_files called, frontend_ready: {}", FRONTEND_READY.load(Ordering::SeqCst));

    if !FRONTEND_READY.load(Ordering::SeqCst) {
        debug!("Frontend not ready, keeping files in queue");
        return; // 前端還沒 ready，先別動佇列
    }

    if let Some(window) = app.get_webview_window("main") {
        let files = drain_pending();
        info!("Found {} pending files to emit", files.len());

        if !files.is_empty() {
            let file_paths: Vec<String> = files
                .into_iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            info!("Emitting open-file event with: {:?}", file_paths);
            let _ = window.emit("open-file", &file_paths);
        }
    } else {
        warn!("No main window found");
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 前端準備就緒時呼叫：標記 ready，並一次性把所有待處理檔案回傳給前端
#[tauri::command]
fn frontend_ready(app: tauri::AppHandle) -> Vec<String> {
    info!("frontend_ready called");
    FRONTEND_READY.store(true, Ordering::SeqCst);
    // 設定 ready 後，立即嘗試處理佇列，統一通過事件發送
    try_emit_pending_files(&app);
    // 不再直接返回檔案，統一通過 open-file 事件交付
    Vec::new()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 在應用程式啟動時立即處理命令列參數
    let args: Vec<PathBuf> = std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .filter(|path| {
            path.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("pdf"))
                .unwrap_or(false)
        })
        .collect();

    info!("Processing command line args: {:?}", args);
    if !args.is_empty() {
        push_pending(args.clone());
        info!("Added {} files to pending queue at startup", args.len());
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![greet, frontend_ready])
        .setup(|_app| {
            // setup 階段不需要處理檔案，讓 RunEvent 處理即可
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |app_handle, event| match event {
        tauri::RunEvent::Ready => {
            debug!("RunEvent::Ready triggered");
            // 只嘗試發送待處理檔案，不再重複處理命令列參數
            debug!("Calling try_emit_pending_files");
            try_emit_pending_files(app_handle);
        }
        // macOS：Finder / Dock 開檔事件（冷啟動也會來）
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        tauri::RunEvent::Opened { urls } => {
            debug!("RunEvent::Opened triggered with {} URLs", urls.len());
            let paths: Vec<PathBuf> = urls
                .iter()
                .filter_map(|url| {
                    if url.scheme() == "file" {
                        url.to_file_path().ok()
                    } else {
                        let url_str = url.to_string();
                        if url_str.starts_with("file://") {
                            let path_str = url_str.replacen("file://", "", 1);
                            let decoded = urlencoding::decode(&path_str)
                                .unwrap_or_else(|_| path_str.clone().into());
                            Some(PathBuf::from(decoded.as_ref()))
                        } else {
                            None
                        }
                    }
                })
                .filter(|path| {
                    path.extension()
                        .and_then(|ext| ext.to_str())
                        .map(|ext| ext.eq_ignore_ascii_case("pdf"))
                        .unwrap_or(false)
                })
                .collect();

            if !paths.is_empty() {
                info!("Processing {} PDF files from Opened event: {:?}", paths.len(), paths);
                push_pending(paths);
                // 若前端已經 ready，這裡會立即 emit；否則佇列暫存，等前端呼叫 frontend_ready 再交付
                try_emit_pending_files(app_handle);
            } else {
                debug!("No PDF files found in Opened event URLs");
            }
        }
        _ => {}
    });
}
