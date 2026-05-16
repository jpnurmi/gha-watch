#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, Rect, WindowEvent,
};
#[cfg(not(target_os = "macos"))]
use tauri_plugin_notification::NotificationExt;

#[cfg(target_os = "macos")]
const DESKTOP_NOTIFICATION_CLICKED_EVENT: &str = "desktop-notification-clicked";

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopNotification {
    #[cfg(target_os = "macos")]
    watch_id: String,
    title: String,
    body: String,
    #[cfg(target_os = "macos")]
    url: String,
    persistent: bool,
}

#[cfg(target_os = "macos")]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopNotificationClick {
    watch_id: String,
    url: String,
}

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

#[tauri::command]
fn show_desktop_notification(
    app: AppHandle,
    notification: DesktopNotification,
) -> Result<(), String> {
    show_clickable_notification(app, notification)
}

#[cfg(target_os = "macos")]
fn show_clickable_notification(
    app: AppHandle,
    notification: DesktopNotification,
) -> Result<(), String> {
    let bundle_identifier = app.config().identifier.clone();

    std::thread::spawn(move || {
        let _ = mac_notification_sys::set_application(&bundle_identifier);
        let _ = notification.persistent;
        let response = mac_notification_sys::Notification::new()
            .title(&notification.title)
            .message(&notification.body)
            .wait_for_click(true)
            .send();

        match response {
            Ok(mac_notification_sys::NotificationResponse::Click)
            | Ok(mac_notification_sys::NotificationResponse::ActionButton(_)) => {
                let _ = app.emit(
                    DESKTOP_NOTIFICATION_CLICKED_EVENT,
                    DesktopNotificationClick {
                        watch_id: notification.watch_id,
                        url: notification.url,
                    },
                );
            }
            Ok(_) => {}
            Err(error) => {
                eprintln!("Could not show GHA Watch notification: {error}");
            }
        }
    });

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn show_clickable_notification(
    app: AppHandle,
    notification: DesktopNotification,
) -> Result<(), String> {
    let _ = notification.persistent;
    app.notification()
        .builder()
        .title(notification.title)
        .body(notification.body)
        .show()
        .map_err(|error| error.to_string())
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
        let positioned_near_tray = tray_rect
            .map(|rect| position_window_near_tray(&window, rect).is_ok())
            .unwrap_or(false);

        if !positioned_near_tray {
            let _ = position_window_near_top_right(&window);
        }

        show_and_focus_window(&window);
    }
}

fn toggle_main_window(app: &AppHandle, tray_rect: Rect) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            if position_window_near_tray(&window, tray_rect).is_err() {
                let _ = position_window_near_top_right(&window);
            }
            show_and_focus_window(&window);
        }
    }
}

fn show_and_focus_window(window: &tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();

    let window = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(75));
        let _ = window.set_focus();
    });
}

fn position_window_near_tray(window: &tauri::WebviewWindow, tray_rect: Rect) -> Result<(), String> {
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let tray_position = tray_rect.position.to_physical::<f64>(scale_factor);
    let tray_size = tray_rect.size.to_physical::<f64>(scale_factor);

    if tray_size.width <= 1.0 && tray_size.height <= 1.0 {
        return Err("tray rect has no usable size".to_string());
    }

    position_window_near_physical_anchor(window, tray_position, tray_size.width, tray_size.height)
}

fn position_window_near_physical_anchor(
    window: &tauri::WebviewWindow,
    anchor_position: PhysicalPosition<f64>,
    anchor_width: f64,
    anchor_height: f64,
) -> Result<(), String> {
    let window_size = window.outer_size().map_err(|error| error.to_string())?;
    let window_width = f64::from(window_size.width);
    let window_height = f64::from(window_size.height);
    let margin = 8.0;

    let monitor = window
        .monitor_from_point(anchor_position.x, anchor_position.y)
        .map_err(|error| error.to_string())?;
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

    let x = (anchor_position.x + anchor_width - window_width).clamp(min_x, max_x);
    let below_y = anchor_position.y + anchor_height + margin;
    let above_y = anchor_position.y - window_height - margin;
    let y = if below_y + window_height <= work_y + work_height {
        below_y
    } else {
        above_y
    }
    .clamp(min_y, max_y);

    window
        .set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))
        .map_err(|error| error.to_string())
}

fn position_window_near_top_right(window: &tauri::WebviewWindow) -> Result<(), String> {
    let window_size = window.outer_size().map_err(|error| error.to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(window
            .primary_monitor()
            .map_err(|error| error.to_string())?);
    let Some(monitor) = monitor else {
        return Ok(());
    };
    let work_area = monitor.work_area();
    let margin = 8_u32;
    let x = work_area.position.x
        + work_area
            .size
            .width
            .saturating_sub(window_size.width)
            .saturating_sub(margin) as i32;
    let y = work_area.position.y + margin as i32;

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            set_tray_indicator,
            show_desktop_notification
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(false) = event {
                let _ = window.hide();
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let tray_builder = TrayIconBuilder::with_id("main")
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

            let tray_builder = {
                let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

                tray_builder
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => show_main_window(app, None),
                        "quit" => app.exit(0),
                        _ => {}
                    })
            };

            tray_builder.build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running GHA Watch");
}
