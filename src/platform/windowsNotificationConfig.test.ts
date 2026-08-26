import { describe, expect, it } from "vitest";
import rustSource from "../../src-tauri/src/main.rs?raw";

describe("Windows notification configuration", () => {
  it("uses WinRT activation callbacks and buttons", () => {
    expect(rustSource).toContain("Toast::new(&app_id)");
    expect(rustSource).toContain(".on_activated(move |native_action|");
    expect(rustSource).toContain("toast.add_button(&action.label, action.id.native_id())");
  });

  it("shows the app for notification body activation", () => {
    expect(rustSource).toContain("None => show_main_window(&activation_app, None)");
    expect(rustSource).toContain("emit_desktop_notification_action(");
  });
});
