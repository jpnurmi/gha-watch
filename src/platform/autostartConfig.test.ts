import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import capabilities from "../../src-tauri/capabilities/default.json";
import cargoToml from "../../src-tauri/Cargo.toml?raw";
import mainRs from "../../src-tauri/src/main.rs?raw";

describe("auto-start configuration", () => {
  it("installs the Tauri auto-start plugin on both sides", () => {
    expect(packageJson.dependencies).toHaveProperty("@tauri-apps/plugin-autostart");
    expect(cargoToml).toContain("tauri-plugin-autostart");
    expect(mainRs).toContain("tauri_plugin_autostart::init");
  });

  it("allows the main window to read and change OS auto-start", () => {
    expect(capabilities.permissions).toEqual(
      expect.arrayContaining([
        "autostart:allow-enable",
        "autostart:allow-disable",
        "autostart:allow-is-enabled",
      ]),
    );
  });
});
