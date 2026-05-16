import { describe, expect, it } from "vitest";
import capabilities from "../../src-tauri/capabilities/default.json";
import config from "../../src-tauri/tauri.linux.conf.json";

describe("Linux packaging configuration", () => {
  it("uses a transparent popup window so CSS can round the panel", () => {
    expect(config.app.windows[0]).toMatchObject({
      label: "main",
      transparent: true,
      backgroundColor: "#00000000",
    });
  });

  it("builds the standard Linux desktop bundle formats", () => {
    expect(config.bundle.targets).toEqual(["appimage", "deb", "rpm"]);
  });

  it("allows the common Linux GitHub CLI install path", () => {
    expect(JSON.stringify(capabilities)).toContain("/usr/bin/gh");
  });
});
