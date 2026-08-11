import { describe, expect, it } from "vitest";
import capabilities from "../../src-tauri/capabilities/default.json";
import config from "../../src-tauri/tauri.linux.conf.json";

describe("Linux packaging configuration", () => {
  it("uses a native resizable window frame", () => {
    expect(config.app.windows[0]).toMatchObject({
      label: "main",
      width: 460,
      resizable: true,
      maximizable: false,
      minimizable: false,
      decorations: true,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      skipTaskbar: true,
    });
  });

  it("does not need app-level drag permissions with native Linux decorations", () => {
    expect(capabilities.permissions).not.toContain("core:window:allow-start-dragging");
  });

  it("builds the standard Linux desktop bundle formats", () => {
    expect(config.bundle.targets).toEqual(["appimage", "deb", "rpm"]);
  });

  it("allows the common Linux GitHub CLI install path", () => {
    expect(JSON.stringify(capabilities)).toContain("/usr/bin/gh");
  });
});
