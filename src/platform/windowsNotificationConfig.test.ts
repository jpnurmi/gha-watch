import { describe, expect, it } from "vitest";
import mainSource from "../../src-tauri/src/main.rs?raw";
import rustSource from "../../src-tauri/src/notifications.rs?raw";

describe("Windows notification configuration", () => {
  it("uses WinRT activation callbacks and buttons", () => {
    expect(rustSource).toContain("ToastNotification::CreateToastNotification(&document)");
    expect(rustSource).toContain("toast.Activated(");
    expect(rustSource).toContain("value.cast::<ToastActivatedEventArgs>()");
    expect(rustSource).toContain("windows_notification_xml(&notification)");
  });

  it("shows the app for notification body activation", () => {
    expect(rustSource).toContain("show_main_window(&activation_app, None)");
    expect(rustSource).toContain("emit_desktop_notification_action(");
  });

  it("scopes notification clearing to the app's group", () => {
    expect(rustSource).toContain("toast.SetGroup(&HSTRING::from(WINDOWS_NOTIFICATION_GROUP))");
    expect(rustSource).toContain("history.RemoveGroupWithId(");
    expect(rustSource).not.toContain("history.ClearWithId(");
    expect(mainSource).toMatch(/generate_handler!\[[\s\S]*?\bclear_desktop_notifications\b/);
  });
});
