use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder,
};

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

pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // File menu items
    let open_file_item = MenuItem::with_id(app, OPEN_FILE_ID, "Open", true, Some("CmdOrCtrl+O"))?;
    let remove_file_item = MenuItem::with_id(app, REMOVE_FILE_ID, "Close File", true, Some("CmdOrCtrl+W"))?;

    #[cfg(target_os = "macos")]
    let open_in_fm_item = MenuItem::with_id(app, OPEN_IN_FILE_MANAGER_ID, "Reveal in Finder", true, Some("CmdOrCtrl+Shift+R"))?;

    #[cfg(target_os = "windows")]
    let open_in_fm_item = MenuItem::with_id(app, OPEN_IN_FILE_MANAGER_ID, "Show in Folder", true, Some("CmdOrCtrl+Shift+R"))?;

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let open_in_fm_item = MenuItem::with_id(app, OPEN_IN_FILE_MANAGER_ID, "Show in File Manager", true, Some("CmdOrCtrl+Shift+R"))?;

    // Edit menu items
    let find_item = MenuItem::with_id(app, FIND_ID, "Find", true, Some("CmdOrCtrl+F"))?;

    // View menu items
    let zoom_in_item = MenuItem::with_id(app, ZOOM_IN_ID, "Zoom In", true, Some("CmdOrCtrl+Plus"))?;
    let zoom_out_item = MenuItem::with_id(app, ZOOM_OUT_ID, "Zoom Out", true, Some("CmdOrCtrl+Minus"))?;
    let fit_mode_item = MenuItem::with_id(app, FIT_MODE_ID, "Fit to Window", true, Some("CmdOrCtrl+0"))?;
    let actual_size_item = MenuItem::with_id(app, ACTUAL_SIZE_ID, "Actual Size", true, Some("CmdOrCtrl+1"))?;
    let toggle_sidebar_item = MenuItem::with_id(app, TOGGLE_SIDEBAR_ID, "Toggle Sidebar", true, Some("CmdOrCtrl+B"))?;

    // About menu item
    let about_item = MenuItem::with_id(app, ABOUT_MENU_ID, "About", true, None::<&str>)?;

    // Build File menu
    let file_menu = Submenu::with_items(
        app,
        "File",
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

    // Build Edit menu
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[&find_item],
    )?;

    // Build View menu
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &zoom_in_item,
            &zoom_out_item,
            &PredefinedMenuItem::separator(app)?,
            &fit_mode_item,
            &actual_size_item,
            &PredefinedMenuItem::separator(app)?,
            &toggle_sidebar_item,
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
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
        let help_menu = Submenu::with_items(
            app,
            "Help",
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
        _ => {}
    }
}

fn show_about_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(ABOUT_WINDOW_LABEL) {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let empty_menu = Menu::new(app)?;

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
    .menu(empty_menu)
    .build()?;

    Ok(())
}
