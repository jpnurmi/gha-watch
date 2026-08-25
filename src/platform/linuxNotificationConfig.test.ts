import { describe, expect, it } from "vitest";
import rustSource from "../../src-tauri/src/main.rs?raw";

describe("Linux notification configuration", () => {
  it("shows the app for the default click and routes supported native actions", () => {
    expect(rustSource).toContain('#[cfg(target_os = "linux")]\nfn show_clickable_notification');
    expect(rustSource).toContain('native.action("default", "Show")');
    expect(rustSource).toContain("handle.wait_for_action(|action|");
    expect(rustSource).toContain('if action == "default"');
    expect(rustSource).toContain("show_main_window(&app, None)");
    expect(rustSource).toContain("notify_rust::get_capabilities()");
    expect(rustSource).toContain("if supports_custom_actions");
    expect(rustSource).toContain("for action in &notification.actions");
    expect(rustSource).toContain("native.action(action.id.native_id(), &action.label)");
    expect(rustSource).toContain("DesktopNotificationActionId::from_native_id(action)");
    expect(rustSource).toContain("DESKTOP_NOTIFICATION_ACTION_EVENT");
    expect(rustSource).toContain("emit_desktop_notification_action(&app, &notification, action_id)");
  });

  it("keeps persistent failures visible and applies the transient timeout", () => {
    expect(rustSource).toContain("native.timeout(Timeout::Never).urgency(Urgency::Critical)");
    expect(rustSource).toContain("Timeout::Milliseconds(");
    expect(rustSource).toMatch(/notification\s*\.timeout_ms/);
  });
});
