use tauri::{
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder,
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
};

use crate::menu_i18n::get_menu_strings;

const ABOUT_WINDOW_LABEL: &str = "about-window";
const ABOUT_MENU_ID: &str = "about-custom";

// File menu IDs
const OPEN_FILE_ID: &str = "open-file";
const REMOVE_FILE_ID: &str = "remove-file";
const OPEN_IN_FILE_MANAGER_ID: &str = "open-in-file-manager";

// Edit menu IDs
const FIND_ID: &str = "find";

// View menu IDs
const ZOOM_IN_ID: &str = "zoom-in";
const ZOOM_OUT_ID: &str = "zoom-out";
const FIT_MODE_ID: &str = "fit-mode";
const ACTUAL_SIZE_ID: &str = "actual-size";
const TOGGLE_SIDEBAR_ID: &str = "toggle-sidebar";
const TOGGLE_DEVTOOLS_ID: &str = "toggle-devtools";

// App menu IDs (non-App Store only)
#[cfg(not(feature = "app-store"))]
const CHECK_UPDATE_ID: &str = "check-update";

pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    build_menu_with_lang(app, "en")
}

pub fn build_menu_with_lang<R: Runtime>(app: &AppHandle<R>, lang: &str) -> tauri::Result<Menu<R>> {
    let strings = get_menu_strings(lang);

    // File menu items
    let open_file_item = MenuItem::with_id(app, OPEN_FILE_ID, strings.open, true, Some("CmdOrCtrl+O"))?;
    let remove_file_item =
        MenuItem::with_id(app, REMOVE_FILE_ID, strings.close_file, true, Some("CmdOrCtrl+W"))?;

    #[cfg(target_os = "macos")]
    let open_in_fm_item = MenuItem::with_id(
        app,
        OPEN_IN_FILE_MANAGER_ID,
        strings.reveal_in_finder,
        true,
        Some("CmdOrCtrl+Shift+R"),
    )?;

    #[cfg(target_os = "windows")]
    let open_in_fm_item = MenuItem::with_id(
        app,
        OPEN_IN_FILE_MANAGER_ID,
        strings.show_in_folder,
        true,
        Some("CmdOrCtrl+Shift+R"),
    )?;

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let open_in_fm_item = MenuItem::with_id(
        app,
        OPEN_IN_FILE_MANAGER_ID,
        strings.show_in_file_manager,
        true,
        Some("CmdOrCtrl+Shift+R"),
    )?;

    // Edit menu items
    let find_item = MenuItem::with_id(app, FIND_ID, strings.find, true, Some("CmdOrCtrl+F"))?;

    // View menu items
    let zoom_in_item = MenuItem::with_id(app, ZOOM_IN_ID, strings.zoom_in, true, Some("CmdOrCtrl+Plus"))?;
    let zoom_out_item =
        MenuItem::with_id(app, ZOOM_OUT_ID, strings.zoom_out, true, Some("CmdOrCtrl+Minus"))?;
    let fit_mode_item =
        MenuItem::with_id(app, FIT_MODE_ID, strings.fit_to_window, true, Some("CmdOrCtrl+0"))?;
    let actual_size_item = MenuItem::with_id(
        app,
        ACTUAL_SIZE_ID,
        strings.actual_size,
        true,
        Some("CmdOrCtrl+1"),
    )?;
    let toggle_sidebar_item = MenuItem::with_id(
        app,
        TOGGLE_SIDEBAR_ID,
        strings.toggle_sidebar,
        true,
        Some("CmdOrCtrl+B"),
    )?;
    let toggle_devtools_item = MenuItem::with_id(
        app,
        TOGGLE_DEVTOOLS_ID,
        strings.toggle_devtools,
        true,
        Some("CmdOrCtrl+Alt+I"),
    )?;

    // About menu item
    let about_item = MenuItem::with_id(app, ABOUT_MENU_ID, strings.about, true, None::<&str>)?;

    // Check for updates menu item (non-App Store only)
    #[cfg(not(feature = "app-store"))]
    let check_update_item = MenuItem::with_id(
        app,
        CHECK_UPDATE_ID,
        strings.check_updates,
        true,
        None::<&str>,
    )?;

    // Build File menu
    let file_menu = Submenu::with_items(
        app,
        strings.file,
        true,
        &[
            &open_file_item,
            &remove_file_item,
            &open_in_fm_item,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::separator(app)?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    // Build Edit menu with system items for macOS clipboard support
    let edit_menu = Submenu::with_items(
        app,
        strings.edit,
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &find_item,
        ],
    )?;

    // Build View menu
    let view_menu = Submenu::with_items(
        app,
        strings.view,
        true,
        &[
            &zoom_in_item,
            &zoom_out_item,
            &PredefinedMenuItem::separator(app)?,
            &fit_mode_item,
            &actual_size_item,
            &PredefinedMenuItem::separator(app)?,
            &toggle_sidebar_item,
            &toggle_devtools_item,
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
        #[cfg(not(feature = "app-store"))]
        let app_menu = Submenu::with_items(
            app,
            "Kano PDF Tool",
            true,
            &[
                &about_item,
                &check_update_item,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;

        #[cfg(feature = "app-store")]
        let app_menu = Submenu::with_items(
            app,
            "Kano PDF Tool",
            true,
            &[
                &about_item,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;

        Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &view_menu])
    }

    #[cfg(not(target_os = "macos"))]
    {
        #[cfg(not(feature = "app-store"))]
        let help_menu = Submenu::with_items(
            app,
            strings.help,
            true,
            &[
                &check_update_item,
                &PredefinedMenuItem::separator(app)?,
                &about_item,
            ],
        )?;

        #[cfg(feature = "app-store")]
        let help_menu = Submenu::with_items(
            app,
            strings.help,
            true,
            &[&about_item],
        )?;

        Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu, &help_menu])
    }
}

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: &MenuEvent) {
    match event.id().as_ref() {
        ABOUT_MENU_ID => {
            if let Err(err) = show_about_window(app) {
                tauri::async_runtime::spawn(async move {
                    eprintln!("[menu] failed to open about window: {err}");
                });
            }
        }
        // File menu events - to be handled by frontend
        OPEN_FILE_ID => {
            let _ = app.emit("menu:open-file", ());
        }
        REMOVE_FILE_ID => {
            let _ = app.emit("menu:remove-file", ());
        }
        OPEN_IN_FILE_MANAGER_ID => {
            let _ = app.emit("menu:open-in-file-manager", ());
        }
        // Edit menu events
        FIND_ID => {
            let _ = app.emit("menu:find", ());
        }
        // View menu events
        ZOOM_IN_ID => {
            let _ = app.emit("menu:zoom-in", ());
        }
        ZOOM_OUT_ID => {
            let _ = app.emit("menu:zoom-out", ());
        }
        FIT_MODE_ID => {
            let _ = app.emit("menu:fit-mode", ());
        }
        ACTUAL_SIZE_ID => {
            let _ = app.emit("menu:actual-size", ());
        }
        TOGGLE_SIDEBAR_ID => {
            let _ = app.emit("menu:toggle-sidebar", ());
        }
        TOGGLE_DEVTOOLS_ID => {
            toggle_devtools_for_active_window(app);
        }
        #[cfg(not(feature = "app-store"))]
        CHECK_UPDATE_ID => {
            let _ = app.emit("menu:check-update", ());
        }
        _ => {}
    }
}

fn toggle_devtools_for_active_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(about_win) = app.get_webview_window(ABOUT_WINDOW_LABEL) {
        if about_win.is_focused().unwrap_or(false) {
            toggle_devtools(&about_win);
            return;
        }
    }

    if let Some(main_win) = app.get_webview_window("main") {
        toggle_devtools(&main_win);
    }
}

fn toggle_devtools<R: Runtime>(win: &tauri::WebviewWindow<R>) {
    if win.is_devtools_open() {
        win.close_devtools();
    } else {
        win.open_devtools();
    }
}

fn show_about_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(ABOUT_WINDOW_LABEL) {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        ABOUT_WINDOW_LABEL,
        WebviewUrl::App("index.html#/about".into()),
    )
    .title("About Kano PDF Tool")
    .inner_size(640.0, 720.0)
    .min_inner_size(480.0, 600.0)
    .resizable(true)
    .visible(true)
    .devtools(true)
    .build()?;

    Ok(())
}
