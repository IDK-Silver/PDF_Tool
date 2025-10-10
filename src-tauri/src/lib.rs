mod media;

use std::{
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

use log::{LevelFilter, debug, info, warn};
use tauri::{Emitter, Manager};

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "pdf", "png", "jpg", "jpeg", "gif", "bmp", "webp", "tiff", "tif", "svg",
];

static PENDING_FILES: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());
static FRONTEND_READY: AtomicBool = AtomicBool::new(false);

fn push_pending<I: IntoIterator<Item = PathBuf>>(iter: I) {
    let mut queue = PENDING_FILES.lock().expect("pending files mutex poisoned");
    for path in iter {
        if !queue.iter().any(|existing| existing == &path) {
            queue.push(path);
        }
    }
}

fn drain_pending() -> Vec<PathBuf> {
    let mut queue = PENDING_FILES.lock().expect("pending files mutex poisoned");
    std::mem::take(&mut *queue)
}

fn is_supported_media(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            SUPPORTED_EXTENSIONS
                .iter()
                .any(|supported| ext.eq_ignore_ascii_case(supported))
        })
        .unwrap_or(false)
}

fn try_emit_pending_files(app: &tauri::AppHandle) {
    debug!(
        "try_emit_pending_files called, frontend_ready: {}",
        FRONTEND_READY.load(Ordering::SeqCst)
    );

    if !FRONTEND_READY.load(Ordering::SeqCst) {
        debug!("Frontend not ready, keeping files in queue");
        return;
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
            if let Err(err) = window.emit("open-file", &file_paths) {
                warn!("Failed to emit open-file event: {err}");
            }
        }
    } else {
        warn!("No main window found");
    }
}

#[tauri::command]
fn frontend_ready(app: tauri::AppHandle) -> Vec<String> {
    info!("frontend_ready called");
    FRONTEND_READY.store(true, Ordering::SeqCst);
    try_emit_pending_files(&app);
    Vec::new()
}

fn collect_startup_args() -> Vec<PathBuf> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .filter(|path| is_supported_media(path))
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    FRONTEND_READY.store(false, Ordering::SeqCst);

    let args = collect_startup_args();
    if !args.is_empty() {
        info!("Processing command line args: {:?}", args);
        push_pending(args.clone());
        info!("Added {} files to pending queue at startup", args.len());
    } else {
        debug!("No startup args to process");
    }

    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let mut paths: Vec<PathBuf> = Vec::new();
            for arg in args {
                if arg.starts_with('-') {
                    continue;
                }
                let path = PathBuf::from(&arg);
                if is_supported_media(&path) {
                    paths.push(path);
                }
            }

            if !paths.is_empty() {
                info!(
                    "Single-instance: received {} paths: {:?}",
                    paths.len(),
                    paths
                );
                push_pending(paths);
                try_emit_pending_files(app);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|_app| {
            crate::media::init_pdf_worker();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            frontend_ready,
            media::analyze_media,
            media::image_read,
            media::compress_image,
            media::compress_pdf_lossless,
            media::compress_pdf_smart,
            media::image_to_pdf,
            media::pdf_open,
            media::pdf_close,
            media::pdf_render_page,
            media::pdf_render_page_async,
            media::pdf_page_size,
            media::pdf_render_cancel,
            media::pdf_insert_blank,
            media::pdf_delete_pages,
            media::pdf_rotate_page,
            media::pdf_copy_page,
            media::pdf_save,
            media::pdf_export_page_image,
            media::pdf_export_page_pdf,
            media::pdf_rotate_page_relative,
        ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |app_handle, event| match event {
        tauri::RunEvent::Ready => {
            debug!("RunEvent::Ready triggered");
            try_emit_pending_files(app_handle);
        }
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
                .filter(|path| is_supported_media(path))
                .collect();

            if !paths.is_empty() {
                info!(
                    "Processing {} files from Opened event: {:?}",
                    paths.len(),
                    paths
                );
                push_pending(paths);
                try_emit_pending_files(app_handle);
            } else {
                debug!("No supported files found in Opened event URLs");
            }
        }
        _ => {}
    });
}
