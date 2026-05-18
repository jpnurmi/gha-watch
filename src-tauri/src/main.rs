#[cfg(target_os = "macos")]
use tauri::Emitter;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, Rect, WindowEvent,
};
#[cfg(any(target_os = "macos", test))]
use tauri::{LogicalPosition, Monitor, PhysicalRect, PhysicalSize};
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

#[cfg(any(target_os = "macos", test))]
#[derive(Clone, Copy, Debug)]
struct MonitorArea {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    work_area: PhysicalRect<i32, u32>,
    scale_factor: f64,
}

#[cfg(any(target_os = "macos", test))]
impl From<&Monitor> for MonitorArea {
    fn from(monitor: &Monitor) -> Self {
        Self {
            position: *monitor.position(),
            size: *monitor.size(),
            work_area: *monitor.work_area(),
            scale_factor: monitor.scale_factor(),
        }
    }
}

#[cfg(any(target_os = "macos", test))]
#[derive(Clone, Copy)]
struct LogicalDisplayRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[cfg(any(target_os = "macos", test))]
impl LogicalDisplayRect {
    fn contains_point(self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.width && y >= self.y && y <= self.y + self.height
    }

    fn center_x(self) -> f64 {
        self.x + self.width / 2.0
    }

    fn center_y(self) -> f64 {
        self.y + self.height / 2.0
    }
}

#[cfg(any(target_os = "macos", test))]
#[derive(Clone, Copy)]
struct LogicalDisplaySize {
    width: f64,
    height: f64,
}

#[cfg(any(target_os = "macos", test))]
fn monitor_area_for_tray_rect(tray_rect: Rect, monitors: &[MonitorArea]) -> Option<MonitorArea> {
    monitors
        .iter()
        .copied()
        .filter_map(|monitor| {
            let tray = tray_rect_to_logical(tray_rect, monitor.scale_factor);
            let bounds = monitor_bounds_to_logical(monitor);

            if !bounds.contains_point(tray.center_x(), tray.center_y()) {
                return None;
            }

            let work_area = monitor_work_area_to_logical(monitor);
            let top_inset = (work_area.y - bounds.y).max(0.0);
            let expected_tray_height = if top_inset > 0.0 {
                top_inset
            } else {
                tray.height
            };

            Some((
                (tray.height - expected_tray_height).abs(),
                (tray.y - bounds.y).abs(),
                monitor,
            ))
        })
        .min_by(|left, right| {
            left.0
                .total_cmp(&right.0)
                .then_with(|| left.1.total_cmp(&right.1))
        })
        .map(|(_, _, monitor)| monitor)
}

#[cfg(any(target_os = "macos", test))]
fn popup_position_for_tray_rect(
    tray_rect: Rect,
    window_size: LogicalDisplaySize,
    monitor: MonitorArea,
) -> Option<LogicalPosition<f64>> {
    let anchor = tray_rect_to_logical(tray_rect, monitor.scale_factor);

    if anchor.width <= 1.0 && anchor.height <= 1.0 {
        return None;
    }

    Some(calculate_popup_position(
        anchor,
        window_size,
        monitor_work_area_to_logical(monitor),
    ))
}

#[cfg(any(target_os = "macos", test))]
fn calculate_popup_position(
    anchor: LogicalDisplayRect,
    window_size: LogicalDisplaySize,
    work_area: LogicalDisplayRect,
) -> LogicalPosition<f64> {
    let margin = 8.0;
    let min_x = work_area.x + margin;
    let max_x = (work_area.x + work_area.width - window_size.width - margin).max(min_x);
    let min_y = work_area.y + margin;
    let max_y = (work_area.y + work_area.height - window_size.height - margin).max(min_y);

    let x = (anchor.x + anchor.width - window_size.width).clamp(min_x, max_x);
    let below_y = anchor.y + anchor.height + margin;
    let above_y = anchor.y - window_size.height - margin;
    let y = if below_y + window_size.height <= work_area.y + work_area.height {
        below_y
    } else {
        above_y
    }
    .clamp(min_y, max_y);

    LogicalPosition::new(x.round(), y.round())
}

#[cfg(any(target_os = "macos", test))]
fn tray_rect_to_logical(tray_rect: Rect, scale_factor: f64) -> LogicalDisplayRect {
    let position = tray_rect.position.to_logical::<f64>(scale_factor);
    let size = tray_rect.size.to_logical::<f64>(scale_factor);

    LogicalDisplayRect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    }
}

#[cfg(any(target_os = "macos", test))]
fn monitor_bounds_to_logical(monitor: MonitorArea) -> LogicalDisplayRect {
    let position = monitor.position.to_logical::<f64>(monitor.scale_factor);
    let size = monitor.size.to_logical::<f64>(monitor.scale_factor);

    LogicalDisplayRect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    }
}

#[cfg(any(target_os = "macos", test))]
fn monitor_work_area_to_logical(monitor: MonitorArea) -> LogicalDisplayRect {
    let position = monitor
        .work_area
        .position
        .to_logical::<f64>(monitor.scale_factor);
    let size = monitor
        .work_area
        .size
        .to_logical::<f64>(monitor.scale_factor);

    LogicalDisplayRect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    }
}

#[cfg(target_os = "macos")]
fn position_window_near_tray(window: &tauri::WebviewWindow, tray_rect: Rect) -> Result<(), String> {
    let window_scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let window_size = window.outer_size().map_err(|error| error.to_string())?;
    let window_size = window_size.to_logical::<f64>(window_scale_factor);
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let monitors = monitors.iter().map(MonitorArea::from).collect::<Vec<_>>();
    let monitor = monitor_area_for_tray_rect(tray_rect, &monitors)
        .ok_or_else(|| "could not find tray monitor".to_string())?;
    let position = popup_position_for_tray_rect(
        tray_rect,
        LogicalDisplaySize {
            width: window_size.width,
            height: window_size.height,
        },
        monitor,
    )
    .ok_or_else(|| "tray rect has no usable size".to_string())?;

    window
        .set_position(LogicalPosition::new(position.x, position.y))
        .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "macos"))]
fn position_window_near_tray(window: &tauri::WebviewWindow, tray_rect: Rect) -> Result<(), String> {
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let tray_position = tray_rect.position.to_physical::<f64>(scale_factor);
    let tray_size = tray_rect.size.to_physical::<f64>(scale_factor);

    if tray_size.width <= 1.0 && tray_size.height <= 1.0 {
        return Err("tray rect has no usable size".to_string());
    }

    position_window_near_physical_anchor(window, tray_position, tray_size.width, tray_size.height)
}

#[cfg(not(target_os = "macos"))]
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

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::{PhysicalRect, PhysicalSize};

    fn physical_tray_rect(x: i32, y: i32, width: u32, height: u32) -> Rect {
        Rect {
            position: PhysicalPosition::new(x, y).into(),
            size: PhysicalSize::new(width, height).into(),
        }
    }

    fn monitor_area(
        x: i32,
        y: i32,
        width: u32,
        height: u32,
        work_x: i32,
        work_y: i32,
        work_width: u32,
        work_height: u32,
        scale_factor: f64,
    ) -> MonitorArea {
        MonitorArea {
            position: PhysicalPosition::new(x, y),
            size: PhysicalSize::new(width, height),
            work_area: PhysicalRect {
                position: PhysicalPosition::new(work_x, work_y),
                size: PhysicalSize::new(work_width, work_height),
            },
            scale_factor,
        }
    }

    #[test]
    fn selects_primary_left_display_from_scaled_macos_tray_rect() {
        let monitors = [
            monitor_area(0, 0, 2880, 1800, 0, 48, 2880, 1752, 2.0),
            monitor_area(1440, 0, 1920, 1080, 1440, 24, 1920, 1056, 1.0),
        ];
        let tray_rect = physical_tray_rect(2800, 0, 44, 44);

        let monitor = monitor_area_for_tray_rect(tray_rect, &monitors).unwrap();

        assert_eq!(monitor.position.x, 0);
    }

    #[test]
    fn positions_secondary_display_popup_in_secondary_logical_work_area() {
        let monitor = monitor_area(1440, 0, 1920, 1080, 1440, 24, 1920, 1056, 1.0);
        let tray_rect = physical_tray_rect(3200, 0, 22, 22);

        let position = popup_position_for_tray_rect(
            tray_rect,
            LogicalDisplaySize {
                width: 420.0,
                height: 360.0,
            },
            monitor,
        )
        .unwrap();

        assert!(position.x >= 1448.0);
        assert!(position.x <= 2932.0);
        assert_eq!(position.y, 32.0);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
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
