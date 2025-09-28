use tauri::{Emitter, Manager};
use std::sync::Mutex;
use std::path::PathBuf;

// 改用隊列來儲存待處理的檔案
static PENDING_FILES: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

fn push_pending<I: IntoIterator<Item = PathBuf>>(iter: I) {
    let mut queue = PENDING_FILES.lock().unwrap();
    queue.extend(iter);
}

fn drain_pending() -> Vec<PathBuf> {
    let mut queue = PENDING_FILES.lock().unwrap();
    let files = queue.clone();
    queue.clear();
    files
}

fn try_emit_pending_files(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let files = drain_pending();
        if !files.is_empty() {
            let file_paths: Vec<String> = files
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            let _ = window.emit("open-file", &file_paths);
        }
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 前端準備就緒時呼叫此命令來獲取待處理的檔案
#[tauri::command]
fn frontend_ready(_app: tauri::AppHandle) -> Vec<String> {
    drain_pending()
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
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
            // Windows/Linux: 檢查命令行參數
            #[cfg(not(target_os = "macos"))]
            {
                let args: Vec<PathBuf> = std::env::args_os()
                    .skip(1)
                    .map(PathBuf::from)
                    .filter(|path| {
                        path.extension()
                            .and_then(|ext| ext.to_str())
                            .map(|ext| ext.to_lowercase() == "pdf")
                            .unwrap_or(false)
                    })
                    .collect();
                if !args.is_empty() {
                    push_pending(args);
                }
            }

            // 嘗試發送待處理的檔案（如果視窗已存在）
            try_emit_pending_files(app_handle);
        }
        tauri::RunEvent::Opened { urls } => {
            // macOS: Finder 開啟檔案事件
            let paths: Vec<PathBuf> = urls
                .iter()
                .filter_map(|url| {
                    // 嘗試解析為檔案路徑
                    if url.scheme() == "file" {
                        url.to_file_path().ok()
                    } else {
                        // 備用方案：手動解析 file:// URL
                        let url_str = url.to_string();
                        if url_str.starts_with("file://") {
                            let path_str = url_str.replace("file://", "");
                            let decoded = urlencoding::decode(&path_str).unwrap_or_else(|_| path_str.clone().into());
                            Some(PathBuf::from(decoded.as_ref()))
                        } else {
                            None
                        }
                    }
                })
                .filter(|path| {
                    path.extension()
                        .and_then(|ext| ext.to_str())
                        .map(|ext| ext.to_lowercase() == "pdf")
                        .unwrap_or(false)
                })
                .collect();

            if !paths.is_empty() {
                println!("Opening PDF files: {:?}", paths);
                push_pending(paths);
                // 嘗試立即發送（如果視窗存在），否則會在前端呼叫 frontend_ready 時獲取
                try_emit_pending_files(app_handle);
            }
        }
        _ => {}
    });
}
