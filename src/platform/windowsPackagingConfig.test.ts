import { describe, expect, it } from "vitest";
import capabilities from "../../src-tauri/capabilities/default.json";
import config from "../../src-tauri/tauri.windows.conf.json";

describe("Windows packaging configuration", () => {
  it("uses native Windows rounding for the popup frame", () => {
    expect(config.app.windows[0]).toMatchObject({
      label: "main",
      decorations: false,
      transparent: false,
      backgroundColor: "#161b22",
      shadow: true,
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
