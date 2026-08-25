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

  it("shows the app for notification body activation", () => {
    expect(rustSource).toContain("None => show_main_window(&activation_app, None)");
    expect(rustSource).toContain("emit_desktop_notification_action(");
  });
});
