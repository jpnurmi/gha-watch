import { describe, expect, it } from "vitest";
import plist from "../../src-tauri/Info.plist?raw";
import rustSource from "../../src-tauri/src/main.rs?raw";

describe("macOS notification configuration", () => {
  it("requests alert-style notifications in the app bundle", () => {
    expect(plist).toContain("<key>NSUserNotificationAlertStyle</key>");
    expect(plist).toContain("<string>alert</string>");
  });

  it("keeps failures visible and dismisses transient notifications after their timeout", () => {
    expect(rustSource).toContain("if !notification.persistent");
    expect(rustSource).toContain("Duration::from_millis(timeout_ms)");
    expect(rustSource).toContain("dismiss_macos_notification(&title, &body)");
    expect(rustSource).toContain("center.removeDeliveredNotification(&notification)");
  });

  it("shows the app on content click and maps validated action labels", () => {
    expect(rustSource).toContain("mac_notification_sys::MainButton::SingleAction(label)");
    expect(rustSource).toContain("mac_notification_sys::MainButton::DropdownActions(");
    expect(rustSource).toMatch(/NotificationResponse::Click\) => \{\s*show_main_window\(&app, None\)/);
    expect(rustSource).toContain(".find(|action| action.label == label)");
    expect(rustSource).toContain("emit_desktop_notification_action(&app, &notification, action.id)");
  });
});
