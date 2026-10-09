import { describe, expect, it } from "vitest";
import config from "../../src-tauri/tauri.conf.json";

describe("macOS packaging configuration", () => {
  it("uses the wider popup window for nested check hierarchy", () => {
    expect(config.app.windows[0]).toMatchObject({
      label: "main",
      width: 460,
    });
  });

  it("keeps polling while the popup is hidden", () => {
    expect(config.app.windows[0]).toMatchObject({
      visible: false,
      backgroundThrottling: "disabled",
    });
    expect(config.bundle.macOS.minimumSystemVersion).toBe("14.0");
  });
});
