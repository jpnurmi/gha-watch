import { describe, expect, it } from "vitest";
import config from "../../src-tauri/tauri.conf.json";

describe("macOS packaging configuration", () => {
  it("uses the wider popup window for nested check hierarchy", () => {
    expect(config.app.windows[0]).toMatchObject({
      label: "main",
      width: 460,
    });
  });
});
