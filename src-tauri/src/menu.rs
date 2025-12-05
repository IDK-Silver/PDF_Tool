use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder,
};

const ABOUT_WINDOW_LABEL: &str = "about-window";
const ABOUT_MENU_ID: &str = "about-custom";

pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about_item = MenuItem::with_id(
        app,
        ABOUT_MENU_ID,
        "About",
        true,
        None::<&str>,
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
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
        Menu::with_items(app, &[&app_menu, &edit_menu])
    }

    #[cfg(not(target_os = "macos"))]
    {
        let help_menu = Submenu::with_items(
            app,
            "Help",
            true,
            &[&about_item],
        )?;
        Menu::with_items(app, &[&edit_menu, &help_menu])
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
        _ => {}
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
    .build()?;

    Ok(())
}
