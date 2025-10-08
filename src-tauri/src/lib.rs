// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod media;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|_app| { crate::media::init_pdf_worker(); Ok(()) })
        .invoke_handler(tauri::generate_handler![
            greet,
            media::analyze_media,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
