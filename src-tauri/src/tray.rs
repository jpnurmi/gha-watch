#[cfg(target_os = "linux")]
use crate::window::save_linux_window_geometry;
use crate::window::{show_main_window, toggle_main_window};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{image::Image, AppHandle, Manager, State};

const TRAY_ID: &str = "gha-watch";

#[derive(Default)]
pub(crate) struct TrayIndicatorState {
    icon: Mutex<Option<TrayIndicatorIconKey>>,
}

#[derive(Clone, PartialEq, Eq)]
struct TrayIndicatorIconKey {
    status: String,
    has_unseen_changes: bool,
}

#[tauri::command]
pub(crate) fn set_tray_indicator(
    app: AppHandle,
    state: State<'_, TrayIndicatorState>,
    status: String,
    tooltip: String,
    has_unseen_changes: bool,
) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        #[cfg(target_os = "macos")]
        tray.set_title(None::<&str>)
            .map_err(|error| error.to_string())?;

        // Avoid resetting the AppIndicator label on Linux: an empty label can be
        // rendered by GNOME shell extensions as an ellipsis that crowds out the icon.
        let next_icon = TrayIndicatorIconKey {
            status,
            has_unseen_changes,
        };
        let should_update_icon = {
            let current_icon = state.icon.lock().map_err(|error| error.to_string())?;
            current_icon.as_ref() != Some(&next_icon)
        };

        // Linux tray icons are rewritten to disk on every native icon update;
        // skip redundant writes to avoid transient missing-icon fallbacks.
        if should_update_icon {
            tray.set_icon_with_as_template(
                Some(tray_icon_for_status(
                    &next_icon.status,
                    next_icon.has_unseen_changes,
                )?),
                false,
            )
            .map_err(|error| error.to_string())?;

            let mut current_icon = state.icon.lock().map_err(|error| error.to_string())?;
            *current_icon = Some(next_icon);
        }

        tray.set_tooltip(Some(&tooltip))
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn tray_icon_for_status(status: &str, has_unseen_changes: bool) -> Result<Image<'static>, String> {
    let bytes = match (status, has_unseen_changes) {
        ("active", true) => include_bytes!("../icons/tray-active-unseen.png").as_slice(),
        ("app-error", true) => include_bytes!("../icons/tray-app-error-unseen.png").as_slice(),
        ("mixed", true) => include_bytes!("../icons/tray-mixed-unseen.png").as_slice(),
        ("cancelled", true) => include_bytes!("../icons/tray-cancelled-unseen.png").as_slice(),
        ("error", true) => include_bytes!("../icons/tray-error-unseen.png").as_slice(),
        ("success", true) => include_bytes!("../icons/tray-success-unseen.png").as_slice(),
        (_, true) => include_bytes!("../icons/tray-idle-unseen.png").as_slice(),
        ("active", false) => include_bytes!("../icons/tray-active.png").as_slice(),
        ("app-error", false) => include_bytes!("../icons/tray-app-error.png").as_slice(),
        ("mixed", false) => include_bytes!("../icons/tray-mixed.png").as_slice(),
        ("cancelled", false) => include_bytes!("../icons/tray-cancelled.png").as_slice(),
        ("error", false) => include_bytes!("../icons/tray-error.png").as_slice(),
        ("success", false) => include_bytes!("../icons/tray-success.png").as_slice(),
        _ => include_bytes!("../icons/tray-idle.png").as_slice(),
    };

    Image::from_bytes(bytes).map_err(|error| error.to_string())
}

pub(crate) fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon_for_status("idle", false)?)
        .icon_as_template(false)
        .tooltip("GHA Watch")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle(), rect);
            }
        });

    #[cfg(target_os = "linux")]
    let tray_builder = match app.path().app_cache_dir() {
        Ok(cache_dir) => tray_builder.temp_dir_path(cache_dir.join("tray-icons")),
        Err(error) => {
            eprintln!("Could not resolve tray icon cache dir: {error}");
            tray_builder
        }
    };

    let tray_builder = {
        let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
        let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

        tray_builder
            .menu(&menu)
            .on_menu_event(|app, event| match event.id().as_ref() {
                "show" => show_main_window(app, None),
                "quit" => {
                    #[cfg(target_os = "linux")]
                    save_linux_window_geometry(app);
                    app.exit(0);
                }
                _ => {}
            })
    };

    tray_builder.build(app)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn loads_mixed_tray_icons() {
        assert!(tray_icon_for_status("mixed", false).is_ok());
        assert!(tray_icon_for_status("mixed", true).is_ok());
    }

    #[test]
    fn loads_app_error_tray_icons() {
        assert!(tray_icon_for_status("app-error", false).is_ok());
        assert!(tray_icon_for_status("app-error", true).is_ok());
    }
}
