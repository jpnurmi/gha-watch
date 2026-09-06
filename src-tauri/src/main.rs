#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod notifications;
mod tray;
mod window;

use tauri::{Manager, WindowEvent};
#[cfg(target_os = "macos")]
use window::configure_macos_window_frame;
#[cfg(target_os = "linux")]
use window::{
    configure_linux_window_controls, configure_linux_window_frame, linux_window_state_label,
    linux_window_supports_position, restore_linux_window_geometry, save_linux_window_geometry,
};

#[tauri::command]
fn get_build_sha() -> &'static str {
    env!("GHA_WATCH_BUILD_SHA")
}

fn main() {
    let builder = tauri::Builder::default();

    // Hidden GTK windows can report invalid geometry, so restore and save explicitly.
    #[cfg(target_os = "linux")]
    let builder = builder.plugin(
        tauri_plugin_window_state::Builder::default()
            .with_state_flags(tauri_plugin_window_state::StateFlags::empty())
            .map_label(|label| linux_window_state_label(label, linux_window_supports_position()))
            .build(),
    );

    builder
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(tray::TrayIndicatorState::default())
        .invoke_handler(tauri::generate_handler![
            get_build_sha,
            tray::set_tray_indicator,
            notifications::show_desktop_notification,
            notifications::clear_desktop_notifications
        ])
        .on_window_event(|window, event| match event {
            #[cfg(target_os = "linux")]
            WindowEvent::CloseRequested { api, .. } => {
                save_linux_window_geometry(window.app_handle());
                api.prevent_close();
                let _ = window.hide();
            }
            #[cfg(not(target_os = "linux"))]
            WindowEvent::Focused(false) => {
                let _ = window.hide();
            }
            _ => {}
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                configure_macos_window_frame(&window)?;
            }

            #[cfg(target_os = "linux")]
            if let Some(window) = app.get_webview_window("main") {
                restore_linux_window_geometry(&window);
                configure_linux_window_frame(&window);
                configure_linux_window_controls(&window);
            }

            tray::setup(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building GHA Watch")
        .run(|app, event| {
            #[cfg(target_os = "linux")]
            if matches!(event, tauri::RunEvent::Exit) {
                save_linux_window_geometry(app);
            }

            #[cfg(not(target_os = "linux"))]
            let _ = (app, event);
        });
}
