import { describe, expect, it } from "vitest";
import cargoManifest from "../../src-tauri/Cargo.toml?raw";
import rustSource from "../../src-tauri/src/main.rs?raw";

describe("Windows notification configuration", () => {
  it("uses the locked WinRT adapter for activation callbacks and buttons", () => {
    expect(cargoManifest).toContain('tauri-winrt-notification = "0.7.2"');
    expect(rustSource).toContain("Toast::new(&app_id)");
    expect(rustSource).toContain(".on_activated(move |native_action|");
    expect(rustSource).toContain("toast.add_button(&action.label, action.id.native_id())");
  });

  it("falls back to Open for the notification body activation", () => {
    expect(rustSource).toContain(".unwrap_or(DesktopNotificationActionId::Open)");
    expect(rustSource).toContain("emit_desktop_notification_action(");
  });
});
