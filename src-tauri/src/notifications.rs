use crate::window::show_main_window;
#[cfg(target_os = "linux")]
use notify_rust::{Notification as NativeNotification, Timeout, Urgency};
use std::collections::HashSet;
#[cfg(target_os = "linux")]
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
#[cfg(windows)]
use tauri_winrt_notification::Toast;
#[cfg(windows)]
use windows::{
    core::{Interface, HSTRING},
    Data::Xml::Dom::XmlDocument,
    Foundation::TypedEventHandler,
    UI::Notifications::{ToastActivatedEventArgs, ToastNotification, ToastNotificationManager},
};

const DESKTOP_NOTIFICATION_ACTION_EVENT: &str = "desktop-notification-action";
#[cfg(target_os = "linux")]
static SUPPORTS_CUSTOM_NOTIFICATION_ACTIONS: OnceLock<bool> = OnceLock::new();
#[cfg(target_os = "linux")]
static ACTIVE_NOTIFICATIONS: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();
#[cfg(windows)]
const WINDOWS_NOTIFICATION_GROUP: &str = "gha-watch";
#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopNotification {
    watch_id: String,
    title: String,
    body: String,
    url: String,
    persistent: bool,
    timeout_ms: Option<u64>,
    actions: Vec<DesktopNotificationActionDefinition>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DesktopNotificationActionDefinition {
    id: DesktopNotificationActionId,
    label: String,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
enum DesktopNotificationActionId {
    Open,
    RerunAll,
    RerunFailed,
    Save,
    Done,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopNotificationAction {
    watch_id: String,
    action: DesktopNotificationActionId,
    url: Option<String>,
}

#[tauri::command]
pub(crate) fn show_desktop_notification(
    app: AppHandle,
    notification: DesktopNotification,
) -> Result<(), String> {
    validate_desktop_notification(&notification)?;
    show_clickable_notification(app, notification)
}

#[tauri::command]
pub(crate) fn clear_desktop_notifications(app: AppHandle) -> Result<(), String> {
    clear_native_notifications(&app)
}

fn validate_desktop_notification(notification: &DesktopNotification) -> Result<(), String> {
    if notification.watch_id.trim().is_empty()
        || notification.watch_id.trim() != notification.watch_id
    {
        return Err("The desktop notification watch ID is invalid.".to_string());
    }

    if !is_verified_github_url(&notification.url) {
        return Err("The desktop notification URL is invalid.".to_string());
    }

    if notification.actions.len() > 3 {
        return Err("Desktop notifications support at most three custom actions.".to_string());
    }

    let mut action_ids = HashSet::new();

    for action in &notification.actions {
        if action.label != action.id.expected_label() || !action_ids.insert(action.id) {
            return Err("The desktop notification actions are invalid.".to_string());
        }
    }

    Ok(())
}

fn is_verified_github_url(url: &str) -> bool {
    let Some(path) = url.strip_prefix("https://github.com/") else {
        return false;
    };

    !url.chars().any(char::is_whitespace)
        && path
            .split(['/', '?', '#'])
            .filter(|part| !part.is_empty())
            .take(2)
            .count()
            == 2
}

impl DesktopNotificationActionId {
    fn expected_label(self) -> &'static str {
        match self {
            Self::Open => "Open",
            Self::RerunAll => "Re-run all",
            Self::RerunFailed => "Re-run failed",
            Self::Save => "Save",
            Self::Done => "Done",
        }
    }

    #[cfg(any(target_os = "linux", windows, test))]
    fn from_native_id(action: &str) -> Option<Self> {
        match action {
            "open" => Some(Self::Open),
            "rerun-all" => Some(Self::RerunAll),
            "rerun-failed" => Some(Self::RerunFailed),
            "save" => Some(Self::Save),
            "done" => Some(Self::Done),
            _ => None,
        }
    }

    #[cfg(any(target_os = "linux", windows, test))]
    fn native_id(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::RerunAll => "rerun-all",
            Self::RerunFailed => "rerun-failed",
            Self::Save => "save",
            Self::Done => "done",
        }
    }
}

fn emit_desktop_notification_action(
    app: &AppHandle,
    notification: &DesktopNotification,
    action: DesktopNotificationActionId,
) {
    let _ = app.emit(
        DESKTOP_NOTIFICATION_ACTION_EVENT,
        DesktopNotificationAction {
            watch_id: notification.watch_id.clone(),
            action,
            url: Some(notification.url.clone()),
        },
    );
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

        let action_labels = notification
            .actions
            .iter()
            .map(|action| action.label.as_str())
            .collect::<Vec<_>>();
        let mut native = mac_notification_sys::Notification::new();
        native
            .title(&notification.title)
            .message(&notification.body)
            .wait_for_click(true);

        match action_labels.as_slice() {
            [label] => {
                native.main_button(mac_notification_sys::MainButton::SingleAction(label));
            }
            [_, _, ..] => {
                native.main_button(mac_notification_sys::MainButton::DropdownActions(
                    "Actions",
                    &action_labels,
                ));
            }
            [] => {}
        }

        let response = native.send();

        match response {
            Ok(mac_notification_sys::NotificationResponse::Click) => {
                show_main_window(&app, None);
                dismiss_macos_notification(&notification.title, &notification.body);
            }
            Ok(mac_notification_sys::NotificationResponse::ActionButton(label)) => {
                if let Some(action) = notification
                    .actions
                    .iter()
                    .find(|action| action.label == label)
                {
                    emit_desktop_notification_action(&app, &notification, action.id);
                    dismiss_macos_notification(&notification.title, &notification.body);
                }
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

#[cfg(target_os = "linux")]
fn show_clickable_notification(
    app: AppHandle,
    notification: DesktopNotification,
) -> Result<(), String> {
    let mut native = NativeNotification::new();
    native.summary(&notification.title).body(&notification.body);
    native.action("default", "Show");

    let supports_custom_actions = *SUPPORTS_CUSTOM_NOTIFICATION_ACTIONS.get_or_init(|| {
        notify_rust::get_capabilities().is_ok_and(|capabilities| {
            capabilities
                .iter()
                .any(|capability| capability == "actions")
        })
    });

    if supports_custom_actions {
        for action in &notification.actions {
            native.action(action.id.native_id(), &action.label);
        }
    }

    if notification.persistent {
        native.timeout(Timeout::Never).urgency(Urgency::Critical);
    } else {
        native.timeout(Timeout::Milliseconds(
            notification
                .timeout_ms
                .unwrap_or(15_000)
                .try_into()
                .unwrap_or(u32::MAX),
        ));
    }

    let handle = native.show().map_err(|error| error.to_string())?;
    let id = handle.id();
    ACTIVE_NOTIFICATIONS
        .get_or_init(Mutex::default)
        .lock()
        .map_err(|error| error.to_string())?
        .insert(id);
    std::thread::spawn(move || {
        handle.wait_for_action(|action| {
            if action == "default" {
                show_main_window(&app, None);
                return;
            }

            let action_id = DesktopNotificationActionId::from_native_id(action);
            let is_registered = supports_custom_actions
                && action_id.is_some_and(|id| {
                    notification
                        .actions
                        .iter()
                        .any(|registered| registered.id == id)
                });

            if let Some(action_id) = action_id.filter(|_| is_registered) {
                emit_desktop_notification_action(&app, &notification, action_id);
            }
        });
        if let Ok(mut active) = ACTIVE_NOTIFICATIONS.get_or_init(Mutex::default).lock() {
            active.remove(&id);
        }
    });

    Ok(())
}

#[cfg(windows)]
fn show_clickable_notification(
    app: AppHandle,
    notification: DesktopNotification,
) -> Result<(), String> {
    // WinRT supports only short or long durations, not millisecond timeouts.
    let _requested_timeout_ms = notification.timeout_ms;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT_TAG: AtomicU64 = AtomicU64::new(1);

    let show = || -> windows::core::Result<()> {
        let document = XmlDocument::new()?;
        document.LoadXml(&HSTRING::from(windows_notification_xml(&notification)))?;
        let toast = ToastNotification::CreateToastNotification(&document)?;
        toast.SetGroup(&HSTRING::from(WINDOWS_NOTIFICATION_GROUP))?;
        toast.SetTag(&HSTRING::from(format!(
            "{:016x}",
            NEXT_TAG.fetch_add(1, Ordering::Relaxed)
        )))?;
        let activation_app = app.clone();
        let activation_notification = notification.clone();
        toast.Activated(&TypedEventHandler::<
            ToastNotification,
            windows::core::IInspectable,
        >::new(move |_, args| {
            let action = args
                .as_ref()
                .and_then(|value| value.cast::<ToastActivatedEventArgs>().ok())
                .and_then(|value| value.Arguments().ok())
                .map(|value| value.to_string())
                .filter(|value| !value.is_empty());
            if let Some(native_action) = action {
                if let Some(action) = DesktopNotificationActionId::from_native_id(&native_action)
                    .filter(|action| {
                        activation_notification
                            .actions
                            .iter()
                            .any(|registered| registered.id == *action)
                    })
                {
                    emit_desktop_notification_action(
                        &activation_app,
                        &activation_notification,
                        action,
                    );
                }
            } else {
                show_main_window(&activation_app, None);
            }
            Ok(())
        }))?;
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(
            windows_notification_app_id(&app),
        ))?
        .Show(&toast)
    };
    show().map_err(|error| error.to_string())
}

#[cfg(windows)]
fn windows_notification_app_id(app: &AppHandle) -> String {
    if tauri::is_dev() {
        Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

#[cfg(any(windows, test))]
fn windows_notification_xml(notification: &DesktopNotification) -> String {
    fn escape(value: &str) -> String {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    let attributes = if notification.persistent {
        "duration=\"long\" scenario=\"reminder\""
    } else {
        "duration=\"short\""
    };
    let actions = notification
        .actions
        .iter()
        .map(|action| {
            format!(
                "<action content=\"{}\" arguments=\"{}\" activationType=\"foreground\"/>",
                escape(&action.label),
                action.id.native_id(),
            )
        })
        .collect::<String>();
    format!(
        "<toast {attributes}><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual><actions>{actions}</actions></toast>",
        escape(&notification.title), escape(&notification.body),
    )
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn clear_native_notifications(_app: &AppHandle) -> Result<(), String> {
    objc2_foundation::NSUserNotificationCenter::defaultUserNotificationCenter()
        .removeAllDeliveredNotifications();
    Ok(())
}

#[cfg(target_os = "linux")]
fn clear_native_notifications(_app: &AppHandle) -> Result<(), String> {
    let mut active = ACTIVE_NOTIFICATIONS
        .get_or_init(Mutex::default)
        .lock()
        .map_err(|error| error.to_string())?;
    if active.is_empty() {
        return Ok(());
    }
    let connection = zbus::blocking::Connection::session().map_err(|error| error.to_string())?;
    close_active_notifications(&mut active, |id| {
        connection
            .call_method(
                Some("org.freedesktop.Notifications"),
                "/org/freedesktop/Notifications",
                Some("org.freedesktop.Notifications"),
                "CloseNotification",
                &id,
            )
            .map(|_| ())
            .map_err(|error| error.to_string())
    })
}

#[cfg(any(target_os = "linux", test))]
fn close_active_notifications(
    active: &mut HashSet<u32>,
    mut close: impl FnMut(u32) -> Result<(), String>,
) -> Result<(), String> {
    let mut failures = Vec::new();
    active.retain(|id| match close(*id) {
        Ok(()) => false,
        Err(error) => {
            failures.push(error);
            true
        }
    });
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("; "))
    }
}

#[cfg(windows)]
fn clear_native_notifications(app: &AppHandle) -> Result<(), String> {
    ToastNotificationManager::History()
        .and_then(|history| {
            history.RemoveGroupWithId(
                &HSTRING::from(WINDOWS_NOTIFICATION_GROUP),
                &HSTRING::from(windows_notification_app_id(app)),
            )
        })
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn desktop_notification(
        actions: Vec<DesktopNotificationActionDefinition>,
    ) -> DesktopNotification {
        DesktopNotification {
            watch_id: "getsentry/sentry/run/123".to_string(),
            title: "CI".to_string(),
            body: "Failed".to_string(),
            url: "https://github.com/getsentry/sentry/actions/runs/123".to_string(),
            persistent: true,
            timeout_ms: None,
            actions,
        }
    }

    fn action(id: DesktopNotificationActionId, label: &str) -> DesktopNotificationActionDefinition {
        DesktopNotificationActionDefinition {
            id,
            label: label.to_string(),
        }
    }

    #[test]
    fn validates_desktop_notification_actions() {
        let notification = desktop_notification(vec![
            action(DesktopNotificationActionId::RerunAll, "Re-run all"),
            action(DesktopNotificationActionId::RerunFailed, "Re-run failed"),
            action(DesktopNotificationActionId::Open, "Open"),
        ]);

        assert!(validate_desktop_notification(&notification).is_ok());
    }

    #[test]
    fn rejects_invalid_desktop_notification_actions() {
        let wrong_label = desktop_notification(vec![action(
            DesktopNotificationActionId::Save,
            "Run a command",
        )]);
        let duplicate = desktop_notification(vec![
            action(DesktopNotificationActionId::Done, "Done"),
            action(DesktopNotificationActionId::Done, "Done"),
        ]);
        let too_many = desktop_notification(vec![
            action(DesktopNotificationActionId::RerunAll, "Re-run all"),
            action(DesktopNotificationActionId::RerunFailed, "Re-run failed"),
            action(DesktopNotificationActionId::Done, "Done"),
            action(DesktopNotificationActionId::Open, "Open"),
        ]);

        assert!(validate_desktop_notification(&wrong_label).is_err());
        assert!(validate_desktop_notification(&duplicate).is_err());
        assert!(validate_desktop_notification(&too_many).is_err());
        assert_eq!(DesktopNotificationActionId::from_native_id("archive"), None);
        assert_eq!(
            DesktopNotificationActionId::from_native_id("open"),
            Some(DesktopNotificationActionId::Open)
        );
        assert_eq!(DesktopNotificationActionId::from_native_id("default"), None);
    }

    #[test]
    fn rejects_untrusted_desktop_notification_urls() {
        let mut notification = desktop_notification(Vec::new());
        notification.url = "https://github.com.evil.example/getsentry/sentry".to_string();

        assert!(validate_desktop_notification(&notification).is_err());
    }
}

#[cfg(test)]
mod notification_lifecycle_tests {
    use super::*;

    #[test]
    fn keeps_failed_dismissals_for_retry() {
        let mut active = HashSet::from([1, 2, 3]);
        let mut attempted = HashSet::new();
        let result = close_active_notifications(&mut active, |id| {
            attempted.insert(id);
            if id == 2 {
                Err("service unavailable".to_string())
            } else {
                Ok(())
            }
        });

        assert_eq!(result, Err("service unavailable".to_string()));
        assert_eq!(attempted, HashSet::from([1, 2, 3]));
        assert_eq!(active, HashSet::from([2]));
        assert!(close_active_notifications(&mut active, |_| Ok(())).is_ok());
        assert!(active.is_empty());
    }

    #[test]
    fn escapes_toast_text_and_action_attributes() {
        let notification = DesktopNotification {
            watch_id: "run/1".to_string(),
            title: "<CI> & tests".to_string(),
            body: "\"quoted\" 'text'".to_string(),
            url: String::new(),
            persistent: true,
            timeout_ms: None,
            actions: vec![DesktopNotificationActionDefinition {
                id: DesktopNotificationActionId::Open,
                label: "Open <CI>".to_string(),
            }],
        };

        let xml = windows_notification_xml(&notification);
        assert!(xml.contains("<text>&lt;CI&gt; &amp; tests</text>"));
        assert!(xml.contains("<text>&quot;quoted&quot; &apos;text&apos;</text>"));
        assert!(xml.contains("content=\"Open &lt;CI&gt;\" arguments=\"open\""));
        assert!(xml.contains("scenario=\"reminder\""));
    }
}
