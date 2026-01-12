use enigo::{Enigo, KeyboardControllable};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use std::sync::Mutex;

struct EnigoState(Mutex<Enigo>);
struct ShortcutState2(Mutex<Option<String>>);

#[tauri::command]
fn type_text(text: String, state: tauri::State<'_, EnigoState>) {
    let mut enigo = state.0.lock().unwrap();
    enigo.key_sequence(&text);
}

#[tauri::command]
fn register_shortcut(app: tauri::AppHandle, shortcut_str: String, state: tauri::State<'_, ShortcutState2>) -> Result<String, String> {
    // Unregister old shortcut if exists
    if let Ok(mut current) = state.0.lock() {
        if let Some(old_shortcut_str) = current.as_ref() {
            if let Ok(old_shortcut) = old_shortcut_str.parse::<Shortcut>() {
                let _ = app.global_shortcut().unregister(old_shortcut);
            }
        }
        *current = Some(shortcut_str.clone());
    }

    // Parse and register new shortcut
    let shortcut: Shortcut = shortcut_str.parse().map_err(|e| format!("Failed to parse shortcut: {}", e))?;
    
    app.global_shortcut().on_shortcut(shortcut.clone(), move |app, registered_shortcut, event| {
        if registered_shortcut == &shortcut {
            let event_name = match event.state() {
                ShortcutState::Pressed => "shortcut-down",
                ShortcutState::Released => "shortcut-up",
            };

            // Always try to emit to widget first
            if let Some(widget) = app.get_webview_window("widget") {
                let _ = widget.emit(event_name, ());
            } else if let Some(main) = app.get_webview_window("main") {
                let _ = main.emit(event_name, ());
            }
        }
    })
    .map_err(|e| format!("Failed to register shortcut: {}", e))?;

    Ok(shortcut_str)
}

#[tauri::command]
fn open_widget(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("widget") {
        // Position widget at bottom center of screen
        if let Ok(monitor) = window.current_monitor() {
            if let Some(monitor) = monitor {
                let screen_size = monitor.size();
                let widget_width = 200;
                let widget_height = 40;
                let margin_bottom = 25; // Shifted down slightly but still visible
                
                let x = (screen_size.width as i32 - widget_width) / 2;
                let y = screen_size.height as i32 - widget_height - margin_bottom;
                
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
            }
        }
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
        .manage(ShortcutState2(Mutex::new(None)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
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

            // Position and show widget at startup
            if let Some(widget) = app.get_webview_window("widget") {
                // Explicitly disable shadows on Windows to remove the "blurred box" effect
                #[cfg(target_os = "windows")]
                {
                    let _ = widget.set_shadow(false);
                }

                if let Ok(monitor) = widget.current_monitor() {
                    if let Some(monitor) = monitor {
                        let screen_size = monitor.size();
                        let widget_width = 200;
                        let widget_height = 40;
                        let margin_bottom = 15;
                        
                        let x = (screen_size.width as i32 - widget_width) / 2;
                        let y = screen_size.height as i32 - widget_height - margin_bottom;
                        
                        let _ = widget.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
                    }
                }
                let _ = widget.show();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![type_text, open_widget, open_main_window, register_shortcut])
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
