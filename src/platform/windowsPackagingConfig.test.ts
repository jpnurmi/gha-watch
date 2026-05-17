import { describe, expect, it } from "vitest";
import capabilities from "../../src-tauri/capabilities/default.json";
import config from "../../src-tauri/tauri.windows.conf.json";

describe("Windows packaging configuration", () => {
  it("uses a transparent popup window without macOS-only window effects", () => {
    expect(config.app.windows[0]).toMatchObject({
      label: "main",
      transparent: true,
      backgroundColor: "#00000000",
      skipTaskbar: true,
    });
    expect(config.app.windows[0]).not.toHaveProperty("windowEffects");
  });

  it("builds standard Windows installer formats", () => {
    expect(config.bundle.targets).toEqual(["nsis", "msi"]);
  });

  it("allows common Windows GitHub CLI install paths", () => {
    const shellPermission = capabilities.permissions
      .filter((permission) => typeof permission !== "string")
      .find((permission) => permission.identifier === "shell:allow-execute");
    const commands = shellPermission?.allow.map((entry) => entry.cmd) ?? [];

    expect(commands).toContain("C:\\Program Files\\GitHub CLI\\gh.exe");
    expect(commands).toContain("C:\\ProgramData\\chocolatey\\bin\\gh.exe");
  });
});
