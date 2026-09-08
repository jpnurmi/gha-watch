#![allow(deprecated)]

use super::{
    emit_desktop_notification_action, macos_notification_timeout_ms, show_main_window,
    DesktopNotification,
};
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, DefinedClass, MainThreadOnly};
use objc2_foundation::{
    NSArray, NSNumber, NSObject, NSObjectNSKeyValueCoding, NSObjectProtocol, NSString,
    NSUserNotification, NSUserNotificationActivationType, NSUserNotificationCenter,
    NSUserNotificationCenterDelegate, NSUUID,
};
use std::cell::{OnceCell, RefCell};
use std::collections::HashMap;
use tauri::AppHandle;

thread_local! {
    static DELEGATE: OnceCell<Retained<NotificationDelegate>> = const { OnceCell::new() };
}

struct NotificationDelegateIvars {
    app: AppHandle,
    active: RefCell<HashMap<String, DesktopNotification>>,
}

define_class!(
    #[unsafe(super = NSObject)]
    #[name = "GHAWatchNotificationDelegate"]
    #[thread_kind = MainThreadOnly]
    #[ivars = NotificationDelegateIvars]
    struct NotificationDelegate;

    unsafe impl NSObjectProtocol for NotificationDelegate {}

    unsafe impl NSUserNotificationCenterDelegate for NotificationDelegate {
        #[unsafe(method(userNotificationCenter:didDeliverNotification:))]
        fn did_deliver(&self, _center: &NSUserNotificationCenter, native: &NSUserNotification) {
            let Some(id) = native.identifier().map(|id| id.to_string()) else {
                return;
            };
            let timeout_ms = self.ivars().active.borrow().get(&id).and_then(dismissal_timeout);
            if let Some(timeout_ms) = timeout_ms {
                let app = self.ivars().app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(timeout_ms));
                    let _ = app.run_on_main_thread(move || dismiss_macos_notification(&id));
                });
            }
        }

        #[unsafe(method(userNotificationCenter:didActivateNotification:))]
        fn did_activate(&self, _center: &NSUserNotificationCenter, native: &NSUserNotification) {
            let Some(id) = native.identifier().map(|id| id.to_string()) else {
                return;
            };
            let notification = self.ivars().active.borrow_mut().remove(&id);
            if let Some(notification) = notification {
                match native.activationType() {
                    NSUserNotificationActivationType::ContentsClicked => {
                        show_main_window(&self.ivars().app, None);
                    }
                    NSUserNotificationActivationType::ActionButtonClicked
                    | NSUserNotificationActivationType::AdditionalActionClicked => {
                        let action = if notification.actions.len() > 1 {
                            native.valueForKey(&NSString::from_str("_alternateActionIndex"))
                                .and_then(|index| index.downcast::<NSNumber>().ok())
                                .and_then(|index| notification.actions.get(index.unsignedLongLongValue() as usize))
                        } else {
                            notification.actions.first()
                        };
                        if let Some(action) = action {
                            emit_desktop_notification_action(&self.ivars().app, &notification, action.id);
                        }
                    }
                    _ => {}
                }
            }
            dismiss_macos_notification(&id);
        }
    }

    impl NotificationDelegate {
        #[unsafe(method(userNotificationCenter:didDismissAlert:))]
        fn did_dismiss(&self, _center: &NSUserNotificationCenter, native: &NSUserNotification) {
            if let Some(id) = native.identifier() {
                dismiss_macos_notification(&id.to_string());
            }
        }
    }
);

impl NotificationDelegate {
    fn new(app: AppHandle) -> Retained<Self> {
        let mtm =
            objc2::MainThreadMarker::new().expect("notification delivery runs on the main thread");
        let this = Self::alloc(mtm).set_ivars(NotificationDelegateIvars {
            app,
            active: RefCell::new(HashMap::new()),
        });
        // SAFETY: NSObject's initializer accepts no arguments
        unsafe { msg_send![super(this), init] }
    }
}

pub(super) fn show_clickable_notification(
    app: AppHandle,
    notification: DesktopNotification,
) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = mac_notification_sys::set_application(&handle.config().identifier);
        DELEGATE.with(|cell| {
            let delegate = cell.get_or_init(|| NotificationDelegate::new(handle));
            let native = native_notification(&notification);
            let id = native
                .identifier()
                .expect("delivery has an identifier")
                .to_string();
            delegate
                .ivars()
                .active
                .borrow_mut()
                .insert(id, notification);
            let center = NSUserNotificationCenter::defaultUserNotificationCenter();
            // SAFETY: the main thread retains the delegate for its lifetime
            unsafe { center.setDelegate(Some(ProtocolObject::from_ref(&**delegate))) };
            center.deliverNotification(&native);
        });
    })
    .map_err(|error| error.to_string())
}

fn native_notification(notification: &DesktopNotification) -> Retained<NSUserNotification> {
    let native = NSUserNotification::new();
    native.setIdentifier(Some(&NSUUID::UUID().UUIDString()));
    native.setTitle(Some(&NSString::from_str(&notification.title)));
    native.setInformativeText(Some(&NSString::from_str(&notification.body)));
    native.setHasActionButton(!notification.actions.is_empty());

    match notification.actions.as_slice() {
        [action] => native.setActionButtonTitle(&NSString::from_str(&action.label)),
        [_, _, ..] => {
            native.setActionButtonTitle(&NSString::from_str("Actions"));
            let labels = notification
                .actions
                .iter()
                .map(|action| NSString::from_str(&action.label))
                .collect::<Vec<_>>();
            let labels = NSArray::from_retained_slice(&labels);
            let enabled = NSNumber::numberWithBool(true);
            // SAFETY: these native menu keys take NSNumber flags and an NSArray of NSString labels
            unsafe {
                native.setValue_forKey(Some(&enabled), &NSString::from_str("_showsButtons"));
                native.setValue_forKey(
                    Some(&enabled),
                    &NSString::from_str("_alwaysShowAlternateActionMenu"),
                );
                native.setValue_forKey(
                    Some(&labels),
                    &NSString::from_str("_alternateActionButtonTitles"),
                );
            }
        }
        [] => {}
    }
    native
}

fn dismissal_timeout(notification: &DesktopNotification) -> Option<u64> {
    (!notification.persistent).then(|| macos_notification_timeout_ms(notification.timeout_ms))
}

fn dismiss_macos_notification(id: &str) {
    DELEGATE.with(|cell| {
        if let Some(delegate) = cell.get() {
            delegate.ivars().active.borrow_mut().remove(id);
        }
    });
    let center = NSUserNotificationCenter::defaultUserNotificationCenter();
    dismiss_delivery(center.deliveredNotifications().iter(), id, |native| {
        center.removeDeliveredNotification(native);
    });
}

fn dismiss_delivery(
    delivered: impl IntoIterator<Item = Retained<NSUserNotification>>,
    id: &str,
    mut remove: impl FnMut(&NSUserNotification),
) {
    for native in delivered {
        if native
            .identifier()
            .is_some_and(|value| value.to_string() == id)
        {
            remove(&native);
        }
    }
}

pub(super) fn clear_native_notifications(app: &AppHandle) -> Result<(), String> {
    app.run_on_main_thread(|| {
        DELEGATE.with(|cell| {
            if let Some(delegate) = cell.get() {
                delegate.ivars().active.borrow_mut().clear();
            }
        });
        NSUserNotificationCenter::defaultUserNotificationCenter().removeAllDeliveredNotifications();
    })
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dismisses_same_text_deliveries_independently() {
        let mut notification = DesktopNotification {
            watch_id: "run/1".to_string(),
            title: "CI".to_string(),
            body: "Finished".to_string(),
            url: String::new(),
            persistent: false,
            timeout_ms: None,
            actions: Vec::new(),
        };
        let transient = native_notification(&notification);
        assert_eq!(dismissal_timeout(&notification), Some(15_000));
        notification.persistent = true;
        let persistent = native_notification(&notification);
        assert_eq!(dismissal_timeout(&notification), None);
        assert_eq!(transient.title(), persistent.title());
        assert_eq!(transient.informativeText(), persistent.informativeText());
        let transient_id = transient.identifier().unwrap().to_string();
        let persistent_id = persistent.identifier().unwrap().to_string();
        assert_ne!(transient_id, persistent_id);
        let delivered = [transient, persistent];

        let mut removed = Vec::new();
        dismiss_delivery(delivered.iter().cloned(), &transient_id, |native| {
            removed.push(native.identifier().unwrap().to_string());
        });
        assert_eq!(removed, [transient_id]);
        removed.clear();
        dismiss_delivery(delivered.iter().cloned(), &persistent_id, |native| {
            removed.push(native.identifier().unwrap().to_string());
        });
        assert_eq!(removed, [persistent_id]);
    }
}
