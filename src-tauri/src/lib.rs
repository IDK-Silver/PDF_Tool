use tauri::{Emitter, Manager};
#[cfg(all(desktop, not(target_os = "macos")))]
use tauri::menu::{MenuBuilder, SubmenuBuilder};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::path::PathBuf;
use log::{info, debug, warn, error};
#[cfg(target_os = "macos")]
use muda::{Menu as NativeMenu, PredefinedMenuItem, Submenu as NativeSubmenu, AboutMetadata};

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
                .map(|ext| {
                    let e = ext.to_ascii_lowercase();
                    matches!(
                        e.as_str(),
                        "pdf" | "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "tiff" | "tif" | "svg"
                    )
                })
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
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // When a second instance is launched (e.g. by opening a file),
            // forward supported file paths to the main instance.
            let supported = [
                "pdf", "png", "jpg", "jpeg", "gif", "bmp", "webp", "tiff", "tif", "svg",
            ];

            let mut paths: Vec<PathBuf> = Vec::new();
            for a in args {
                // Ignore flags; only consider arguments that look like paths
                if a.starts_with('-') { continue; }
                let p = PathBuf::from(&a);
                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    if supported.iter().any(|s| ext.eq_ignore_ascii_case(s)) {
                        paths.push(p);
                    }
                }
            }

            if !paths.is_empty() {
                info!("Single-instance: received {} paths: {:?}", paths.len(), paths);
                push_pending(paths);
                try_emit_pending_files(app);
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![greet, frontend_ready])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let app_name = app.package_info().name.clone();
                let version = app.package_info().version.to_string();
                let copyright = app.config().bundle.copyright.clone();
                let publisher = app.config().bundle.publisher.clone();
                let handle = app.app_handle().clone();

                handle.run_on_main_thread(move || {
                    if let Err(err) = init_macos_menu(app_name, version, copyright, publisher) {
                        error!("[macOS] Failed to initialize menu: {err:?}");
                    }
                })?;
            }

            #[cfg(all(desktop, not(target_os = "macos")))]
            {
                let app_name = app.package_info().name.clone();

                let app_menu = SubmenuBuilder::new(app, &app_name)
                    .about(None)
                    .separator()
                    .quit()
                    .build()?;

                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;

                let window_menu = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .maximize()
                    .close_window()
                    .build()?;

                let help_menu = SubmenuBuilder::new(app, "Help")
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .items(&[&app_menu, &edit_menu, &window_menu, &help_menu])
                    .build()?;

                app.set_menu(menu)?;
            }

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
                        .map(|ext| {
                            let e = ext.to_ascii_lowercase();
                            matches!(
                                e.as_str(),
                                "pdf" | "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "tiff" | "tif" | "svg"
                            )
                        })
                        .unwrap_or(false)
                })
                .collect();

            if !paths.is_empty() {
                info!("Processing {} files from Opened event: {:?}", paths.len(), paths);
                push_pending(paths);
                // 若前端已經 ready，這裡會立即 emit；否則佇列暫存，等前端呼叫 frontend_ready 再交付
                try_emit_pending_files(app_handle);
            } else {
                debug!("No supported files found in Opened event URLs");
            }
        }
        _ => {}
    });
}

#[cfg(target_os = "macos")]
fn init_macos_menu(
    app_name: String,
    version: String,
    copyright: Option<String>,
    publisher: Option<String>,
) -> muda::Result<()> {
    let mut metadata = AboutMetadata::default();
    metadata.name = Some(app_name.clone());
    metadata.version = Some(version);
    metadata.copyright = copyright;
    if let Some(publisher) = publisher {
        metadata.authors = Some(vec![publisher]);
    }
    let metadata = Some(metadata);

    let app_menu = {
        let submenu = NativeSubmenu::new(&app_name, true);
        let items = [
            PredefinedMenuItem::about(None, metadata.clone()),
            PredefinedMenuItem::separator(),
            PredefinedMenuItem::services(None),
            PredefinedMenuItem::separator(),
            PredefinedMenuItem::hide(None),
            PredefinedMenuItem::hide_others(None),
            PredefinedMenuItem::show_all(None),
            PredefinedMenuItem::separator(),
            PredefinedMenuItem::quit(None),
        ];
        for item in &items {
            submenu.append(item)?;
        }
        submenu
    };

    let edit_menu = {
        let submenu = NativeSubmenu::new("Edit", true);
        let items = [
            PredefinedMenuItem::undo(None),
            PredefinedMenuItem::redo(None),
            PredefinedMenuItem::separator(),
            PredefinedMenuItem::cut(None),
            PredefinedMenuItem::copy(None),
            PredefinedMenuItem::paste(None),
            PredefinedMenuItem::select_all(None),
        ];
        for item in &items {
            submenu.append(item)?;
        }
        submenu
    };

    let window_menu = {
        let submenu = NativeSubmenu::new("Window", true);
        let items = [
            PredefinedMenuItem::minimize(None),
            PredefinedMenuItem::maximize(None),
            PredefinedMenuItem::fullscreen(None),
            PredefinedMenuItem::separator(),
            PredefinedMenuItem::close_window(None),
            PredefinedMenuItem::bring_all_to_front(None),
        ];
        for item in &items {
            submenu.append(item)?;
        }
        submenu
    };

    let help_menu = NativeSubmenu::new("Help", true);

    let menu = NativeMenu::new();
    menu.append(&app_menu)?;
    menu.append(&edit_menu)?;
    menu.append(&window_menu)?;
    menu.append(&help_menu)?;
    menu.init_for_nsapp();
    Ok(())
}
