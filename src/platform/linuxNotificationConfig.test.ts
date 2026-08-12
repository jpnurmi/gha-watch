import { describe, expect, it } from "vitest";
import rustSource from "../../src-tauri/src/main.rs?raw";

describe("Linux notification configuration", () => {
  it("opens the notification URL when the native banner is clicked", () => {
    expect(rustSource).toContain('#[cfg(target_os = "linux")]\nfn show_clickable_notification');
    expect(rustSource).toContain('native.action("default", "Open")');
    expect(rustSource).toContain("handle.wait_for_action(|action|");
    expect(rustSource).toContain('if action == "default"');
    expect(rustSource).toContain("DESKTOP_NOTIFICATION_CLICKED_EVENT");
    expect(rustSource).toContain("watch_id: notification.watch_id");
    expect(rustSource).toContain("url: notification.url");
  });

  it("keeps persistent failures visible and applies the transient timeout", () => {
    expect(rustSource).toContain("native.timeout(Timeout::Never).urgency(Urgency::Critical)");
    expect(rustSource).toContain("Timeout::Milliseconds(");
    expect(rustSource).toMatch(/notification\s*\.timeout_ms/);
  });
});
