import { describe, expect, it } from "vitest";
import plist from "../../src-tauri/Info.plist?raw";
import rustSource from "../../src-tauri/src/notifications/macos.rs?raw";

describe("macOS notification configuration", () => {
  it("requests alert-style notifications in the app bundle", () => {
    expect(plist).toContain("<key>NSUserNotificationAlertStyle</key>");
    expect(plist).toContain("<string>alert</string>");
  });

  it("keeps failures visible and dismisses transient notifications after their timeout", () => {
    expect(rustSource).toContain("(!notification.persistent).then(");
    expect(rustSource).toContain("Duration::from_millis(timeout_ms)");
    expect(rustSource).toContain("dismiss_macos_notification(&id)");
    expect(rustSource).toContain("center.removeDeliveredNotification(native)");
  });

  it("shows the app on content click and maps validated actions", () => {
    expect(rustSource).toContain("native.setActionButtonTitle(&NSString::from_str(&action.label))");
    expect(rustSource).toContain('NSString::from_str("_alternateActionButtonTitles")');
    expect(rustSource).toMatch(/ContentsClicked => \{\s*show_main_window\(&self.ivars\(\).app, None\)/);
    expect(rustSource).toContain("notification.actions.get(index.unsignedLongLongValue() as usize)");
    expect(rustSource).toContain("emit_desktop_notification_action(&self.ivars().app, &notification, action.id)");
  });
});
