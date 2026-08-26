import { describe, expect, it } from "vitest";
import rustSource from "../../src-tauri/src/main.rs?raw";

describe("Windows notification configuration", () => {
  it("uses WinRT activation callbacks and buttons", () => {
    expect(rustSource).toContain("Toast::new(&app_id)");
    expect(rustSource).toContain(".on_activated(move |native_action|");
    expect(rustSource).toContain("toast.add_button(&action.label, action.id.native_id())");
  });

  it("falls back to Open for the notification body activation", () => {
    expect(rustSource).toContain(".unwrap_or(DesktopNotificationActionId::Open)");
    expect(rustSource).toContain("emit_desktop_notification_action(");
  });
});
