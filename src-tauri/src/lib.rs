use enigo::{Enigo, KeyboardControllable};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use std::sync::Mutex;

struct EnigoState(Mutex<Enigo>);

#[tauri::command]
fn type_text(text: String, state: tauri::State<'_, EnigoState>) {
    let mut enigo = state.0.lock().unwrap();
    enigo.key_sequence(&text);
}

#[tauri::command]
fn open_widget(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("widget") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn open_main_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
pub fn run() {
    tauri::Builder::default()
        .manage(EnigoState(Mutex::new(Enigo::new())))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Main Window", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Register global shortcut: Ctrl+Shift+F9 (Highly unique)
            let shortcut: Shortcut = "Ctrl+Shift+F9".parse().expect("failed to parse shortcut");
            
            // on_shortcut handles registration and handler attachment in one call.
            // We wrap it in match to avoid crashing if the shortcut is already taken by another app.
            match app.global_shortcut().on_shortcut(shortcut.clone(), move |app, registered_shortcut, event| {
                if event.state() == ShortcutState::Pressed && registered_shortcut == &shortcut {
                    println!("Shortcut triggered!");
                    if let Some(widget) = app.get_webview_window("widget") {
                        if widget.is_visible().unwrap_or(false) {
                            let _ = widget.emit("shortcut-triggered", ());
                        } else if let Some(main) = app.get_webview_window("main") {
                            let _ = main.emit("shortcut-triggered", ());
                        }
                    } else if let Some(main) = app.get_webview_window("main") {
                        let _ = main.emit("shortcut-triggered", ());
                    }
                }
            }) {
                Ok(_) => println!("Successfully registered shortcut: Ctrl+Shift+F9"),
                Err(e) => eprintln!("Failed to register shortcut: {}. The app will continue without global shortcut functionality.", e),
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![type_text, open_widget, open_main_window])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
                // Hide instead of closing all windows if necessary
                if let Some(main) = app_handle.get_webview_window("main") {
                    let _ = main.hide();
                }
            }
            _ => {}
        });
}
