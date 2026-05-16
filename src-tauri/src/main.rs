use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, Rect, WindowEvent,
};

#[tauri::command]
fn set_tray_indicator(
    app: AppHandle,
    status: String,
    tooltip: String,
    has_unseen_changes: bool,
) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_title(None::<&str>)
            .map_err(|error| error.to_string())?;
        tray.set_icon_with_as_template(
            Some(tray_icon_for_status(&status, has_unseen_changes)?),
            false,
        )
        .map_err(|error| error.to_string())?;
        tray.set_tooltip(Some(&tooltip))
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn tray_icon_for_status(status: &str, has_unseen_changes: bool) -> Result<Image<'static>, String> {
    let bytes = match (status, has_unseen_changes) {
        ("active", true) => include_bytes!("../icons/tray-active-unseen.png").as_slice(),
        ("cancelled", true) => include_bytes!("../icons/tray-cancelled-unseen.png").as_slice(),
        ("error", true) => include_bytes!("../icons/tray-error-unseen.png").as_slice(),
        ("success", true) => include_bytes!("../icons/tray-success-unseen.png").as_slice(),
        (_, true) => include_bytes!("../icons/tray-idle-unseen.png").as_slice(),
        ("active", false) => include_bytes!("../icons/tray-active.png").as_slice(),
        ("cancelled", false) => include_bytes!("../icons/tray-cancelled.png").as_slice(),
        ("error", false) => include_bytes!("../icons/tray-error.png").as_slice(),
        ("success", false) => include_bytes!("../icons/tray-success.png").as_slice(),
        _ => include_bytes!("../icons/tray-idle.png").as_slice(),
    };

    Image::from_bytes(bytes).map_err(|error| error.to_string())
}

fn show_main_window(app: &AppHandle, tray_rect: Option<Rect>) {
    if let Some(window) = app.get_webview_window("main") {
        if let Some(rect) = tray_rect {
            let _ = position_window_near_tray(&window, rect);
        }
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_main_window(app: &AppHandle, tray_rect: Rect) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = position_window_near_tray(&window, tray_rect);
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn position_window_near_tray(window: &tauri::WebviewWindow, tray_rect: Rect) -> tauri::Result<()> {
    let scale_factor = window.scale_factor()?;
    let tray_position = tray_rect.position.to_physical::<f64>(scale_factor);
    let tray_size = tray_rect.size.to_physical::<f64>(scale_factor);
    let window_size = window.outer_size()?;
    let window_width = f64::from(window_size.width);
    let window_height = f64::from(window_size.height);
    let margin = 8.0;

    let monitor = window.monitor_from_point(tray_position.x, tray_position.y)?;
    let work_area = monitor.as_ref().map(|monitor| monitor.work_area());
    let (work_x, work_y, work_width, work_height) = work_area
        .map(|area| {
            (
                f64::from(area.position.x),
                f64::from(area.position.y),
                f64::from(area.size.width),
                f64::from(area.size.height),
            )
        })
        .unwrap_or((0.0, 0.0, f64::MAX, f64::MAX));

    let min_x = work_x + margin;
    let max_x = (work_x + work_width - window_width - margin).max(min_x);
    let min_y = work_y + margin;
    let max_y = (work_y + work_height - window_height - margin).max(min_y);

    let x = (tray_position.x + tray_size.width - window_width).clamp(min_x, max_x);
    let below_y = tray_position.y + tray_size.height + margin;
    let above_y = tray_position.y - window_height - margin;
    let y = if below_y + window_height <= work_y + work_height {
        below_y
    } else {
        above_y
    }
    .clamp(min_y, max_y);

    window.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![set_tray_indicator])
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(false) = event {
                let _ = window.hide();
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::with_id("main")
                .icon(tray_icon_for_status("idle", false)?)
                .icon_as_template(false)
                .tooltip("GHA Watch")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main_window(app, None),
                    "quit" => app.exit(0),
                    _ => {}
                })
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
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running GHA Watch");
}
