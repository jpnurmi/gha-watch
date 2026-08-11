#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

#[cfg(not(target_os = "macos"))]
use notify_rust::{Notification as NativeNotification, Timeout, Urgency};
#[cfg(target_os = "macos")]
use objc2_app_kit::NSView;
#[cfg(target_os = "macos")]
use tauri::Emitter;
#[cfg(any(not(target_os = "linux"), test))]
use tauri::PhysicalPosition;
use tauri::WindowEvent;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Rect, State,
};
#[cfg(any(target_os = "macos", test))]
use tauri::{LogicalPosition, Monitor, PhysicalRect, PhysicalSize};
#[cfg(not(target_os = "macos"))]
use tauri_plugin_notification::NotificationExt;

#[cfg(target_os = "macos")]
const DESKTOP_NOTIFICATION_CLICKED_EVENT: &str = "desktop-notification-clicked";
#[cfg(target_os = "macos")]
const MACOS_POPUP_CORNER_RADIUS: f64 = 12.0;
#[cfg(target_os = "linux")]
const LINUX_WINDOW_FRAME_CSS: &[u8] = br#"
window.gha-watch-rounded:not(.maximized):not(.fullscreen):not(.tiled):not(.tiled-top):not(.tiled-right):not(.tiled-bottom):not(.tiled-left),
window.gha-watch-rounded:not(.maximized):not(.fullscreen):not(.tiled):not(.tiled-top):not(.tiled-right):not(.tiled-bottom):not(.tiled-left) > decoration {
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}
"#;

const TRAY_ID: &str = "gha-watch";

#[derive(Default)]
struct TrayIndicatorState {
    icon: Mutex<Option<TrayIndicatorIconKey>>,
}

#[derive(Clone, PartialEq, Eq)]
struct TrayIndicatorIconKey {
    status: String,
    has_unseen_changes: bool,
}

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
    #[cfg(target_os = "macos")]
    timeout_ms: Option<u64>,
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

        if !notification.persistent {
            let title = notification.title.clone();
            let body = notification.body.clone();
            let timeout_ms = notification.timeout_ms.unwrap_or(15_000);

            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(timeout_ms));
                dismiss_macos_notification(&title, &body);
            });
        }

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

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn dismiss_macos_notification(title: &str, body: &str) {
    let center = objc2_foundation::NSUserNotificationCenter::defaultUserNotificationCenter();
    let delivered = center.deliveredNotifications();

    for notification in delivered.iter() {
        let matches_title = notification
            .title()
            .is_some_and(|value| value.to_string() == title);
        let matches_body = notification
            .informativeText()
            .is_some_and(|value| value.to_string() == body);

        if matches_title && matches_body {
            center.removeDeliveredNotification(&notification);
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn show_clickable_notification(
    app: AppHandle,
    notification: DesktopNotification,
) -> Result<(), String> {
    if !notification.persistent {
        return app
            .notification()
            .builder()
            .title(notification.title)
            .body(notification.body)
            .show()
            .map_err(|error| error.to_string());
    }

    let mut native = NativeNotification::new();
    native.summary(&notification.title).body(&notification.body);
    native.timeout(Timeout::Never).urgency(Urgency::Critical);

    #[cfg(windows)]
    if !tauri::is_dev() {
        native.app_id(&app.config().identifier);
    }

    #[cfg(not(windows))]
    let _ = app;

    native.show().map(|_| ()).map_err(|error| error.to_string())
}

fn tray_icon_for_status(status: &str, has_unseen_changes: bool) -> Result<Image<'static>, String> {
    let bytes = match (status, has_unseen_changes) {
        ("active", true) => include_bytes!("../icons/tray-active-unseen.png").as_slice(),
        ("mixed", true) => include_bytes!("../icons/tray-mixed-unseen.png").as_slice(),
        ("cancelled", true) => include_bytes!("../icons/tray-cancelled-unseen.png").as_slice(),
        ("error", true) => include_bytes!("../icons/tray-error-unseen.png").as_slice(),
        ("success", true) => include_bytes!("../icons/tray-success-unseen.png").as_slice(),
        (_, true) => include_bytes!("../icons/tray-idle-unseen.png").as_slice(),
        ("active", false) => include_bytes!("../icons/tray-active.png").as_slice(),
        ("mixed", false) => include_bytes!("../icons/tray-mixed.png").as_slice(),
        ("cancelled", false) => include_bytes!("../icons/tray-cancelled.png").as_slice(),
        ("error", false) => include_bytes!("../icons/tray-error.png").as_slice(),
        ("success", false) => include_bytes!("../icons/tray-success.png").as_slice(),
        _ => include_bytes!("../icons/tray-idle.png").as_slice(),
    };

    Image::from_bytes(bytes).map_err(|error| error.to_string())
}

fn show_main_window(app: &AppHandle, tray_rect: Option<Rect>) {
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "linux")]
        let _ = tray_rect;

        #[cfg(not(target_os = "linux"))]
        {
            let positioned_near_tray = tray_rect
                .map(|rect| position_window_near_tray(&window, rect).is_ok())
                .unwrap_or(false);

            if !positioned_near_tray {
                let _ = position_window_near_top_right(&window);
            }
        }

        show_and_focus_window(&window);
    }
}

fn toggle_main_window(app: &AppHandle, tray_rect: Rect) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            #[cfg(target_os = "linux")]
            let _ = tray_rect;

            #[cfg(not(target_os = "linux"))]
            {
                if position_window_near_tray(&window, tray_rect).is_err() {
                    let _ = position_window_near_top_right(&window);
                }
            }
            show_and_focus_window(&window);
        }
    }
}

fn show_and_focus_window(window: &tauri::WebviewWindow) {
    let _ = window.show();

    #[cfg(target_os = "linux")]
    configure_linux_window_controls(window);

    #[cfg(target_os = "linux")]
    present_linux_window(window);

    #[cfg(target_os = "linux")]
    return;

    #[cfg(not(target_os = "linux"))]
    let _ = window.set_focus();

    #[cfg(not(target_os = "linux"))]
    {
        let window = window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(75));
            let _ = window.set_focus();
        });
    }
}

#[cfg(target_os = "linux")]
fn present_linux_window(window: &tauri::WebviewWindow) {
    let window = window.clone();
    let handle = window.clone();
    let _ = window.run_on_main_thread(move || {
        use gtk::prelude::*;

        if let Ok(gtk_window) = handle.gtk_window() {
            gtk_window.present();
        }
    });
}

#[cfg(target_os = "linux")]
fn configure_linux_window_frame(window: &tauri::WebviewWindow) {
    let window = window.clone();
    let handle = window.clone();
    let _ = window.run_on_main_thread(move || {
        use gtk::prelude::*;

        if let Ok(gtk_window) = handle.gtk_window() {
            let provider = gtk::CssProvider::new();
            if let Err(error) = provider.load_from_data(LINUX_WINDOW_FRAME_CSS) {
                eprintln!("Could not load Linux window frame CSS: {error}");
                return;
            }

            if let Some(screen) = gtk::prelude::WidgetExt::screen(&gtk_window) {
                gtk::StyleContext::add_provider_for_screen(
                    &screen,
                    &provider,
                    gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
                );
            }
            gtk_window.style_context().add_class("gha-watch-rounded");
        }
    });
}

#[cfg(target_os = "linux")]
fn configure_linux_window_controls(window: &tauri::WebviewWindow) {
    let window = window.clone();
    let handle = window.clone();
    let _ = window.run_on_main_thread(move || {
        use gtk::prelude::*;

        if let Ok(gtk_window) = handle.gtk_window() {
            gtk_window.set_type_hint(gtk::gdk::WindowTypeHint::Utility);

            if let Some(titlebar) = gtk_window.titlebar() {
                if let Some(event_box) = titlebar.downcast_ref::<gtk::EventBox>() {
                    event_box.set_above_child(false);
                }
            }

            if let Some(gdk_window) = gtk_window.window() {
                gdk_window.set_functions(
                    gtk::gdk::WMFunction::MOVE
                        | gtk::gdk::WMFunction::RESIZE
                        | gtk::gdk::WMFunction::CLOSE,
                );
            }
        }
    });
}

#[cfg(target_os = "macos")]
fn configure_macos_window_frame(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let ns_view = window.ns_view()?;

    // Tauri exposes the content NSView here and runs setup on the main thread.
    unsafe {
        let view: &NSView = &*ns_view.cast();
        view.setWantsLayer(true);

        if let Some(layer) = view.layer() {
            layer.setCornerRadius(MACOS_POPUP_CORNER_RADIUS);
            layer.setMasksToBounds(true);
        }
    }

    Ok(())
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

#[cfg(windows)]
fn position_window_near_tray(window: &tauri::WebviewWindow, tray_rect: Rect) -> Result<(), String> {
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let tray_position = tray_rect.position.to_physical::<f64>(scale_factor);
    let tray_size = tray_rect.size.to_physical::<f64>(scale_factor);

    if tray_size.width <= 1.0 && tray_size.height <= 1.0 {
        return Err("tray rect has no usable size".to_string());
    }

    position_window_near_physical_anchor(window, tray_position, tray_size.width, tray_size.height)
}

#[cfg(windows)]
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

#[cfg(not(target_os = "linux"))]
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
    let builder = tauri::Builder::default();

    #[cfg(target_os = "linux")]
    let builder = builder.plugin(
        tauri_plugin_window_state::Builder::default()
            .with_state_flags(
                tauri_plugin_window_state::StateFlags::POSITION
                    | tauri_plugin_window_state::StateFlags::SIZE,
            )
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
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(TrayIndicatorState::default())
        .invoke_handler(tauri::generate_handler![
            set_tray_indicator,
            show_desktop_notification
        ])
        .on_window_event(|window, event| match event {
            #[cfg(target_os = "linux")]
            WindowEvent::CloseRequested { api, .. } => {
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
                configure_linux_window_frame(&window);
                configure_linux_window_controls(&window);
            }

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
        bounds: (i32, i32, u32, u32),
        work_area: (i32, i32, u32, u32),
        scale_factor: f64,
    ) -> MonitorArea {
        let (x, y, width, height) = bounds;
        let (work_x, work_y, work_width, work_height) = work_area;

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
            monitor_area((0, 0, 2880, 1800), (0, 48, 2880, 1752), 2.0),
            monitor_area((1440, 0, 1920, 1080), (1440, 24, 1920, 1056), 1.0),
        ];
        let tray_rect = physical_tray_rect(2800, 0, 44, 44);

        let monitor = monitor_area_for_tray_rect(tray_rect, &monitors).unwrap();

        assert_eq!(monitor.position.x, 0);
    }

    #[test]
    fn positions_secondary_display_popup_in_secondary_logical_work_area() {
        let monitor = monitor_area((1440, 0, 1920, 1080), (1440, 24, 1920, 1056), 1.0);
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

    #[test]
    fn loads_mixed_tray_icons() {
        assert!(tray_icon_for_status("mixed", false).is_ok());
        assert!(tray_icon_for_status("mixed", true).is_ok());
    }
}
