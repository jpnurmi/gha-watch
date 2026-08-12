import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const rustSource = readFileSync(new URL("../../src-tauri/src/main.rs", import.meta.url), "utf8");
const capability = JSON.parse(
  readFileSync(new URL("../../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
) as { permissions: Array<string | object> };
const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { dependencies: Record<string, string> };

describe("keyboard and clipboard shortcut wiring", () => {
  it("binds local shortcuts through the text-entry guard", () => {
    expect(mainSource).toContain('window.addEventListener("keydown", handlePopupKeydown)');
    expect(mainSource).toContain("shouldHandleLocalShortcut({");
    expect(mainSource).toContain("getAdjacentWatchView(currentWatchView");
    expect(mainSource).toContain("getPopupEscapeLayer({");
  });

  it("renders accessible tab, tree, menu, and reorder status semantics", () => {
    expect(mainSource).toContain('role="tablist"');
    expect(mainSource).toContain('role="tree"');
    expect(mainSource).toContain('role="treeitem"');
    expect(mainSource).toContain('aria-live="polite"');
    expect(mainSource).toContain('aria-keyshortcuts="Alt+Shift+ArrowUp Alt+Shift+ArrowDown"');
  });

  it("uses exact compatible plugins with least-privilege clipboard access", () => {
    expect(packageJson.dependencies["@tauri-apps/plugin-clipboard-manager"]).toBe("2.3.2");
    expect(packageJson.dependencies["@tauri-apps/plugin-global-shortcut"]).toBe("2.3.2");
    expect(capability.permissions).toContain("clipboard-manager:allow-read-text");
    expect(capability.permissions).not.toContain("clipboard-manager:allow-write-text");
    expect(capability.permissions).toContain("global-shortcut:allow-register");
    expect(capability.permissions).toContain("global-shortcut:allow-unregister");
    expect(rustSource).toContain("tauri_plugin_clipboard_manager::init()");
    expect(rustSource).toContain("tauri_plugin_global_shortcut::Builder::default().build()");
  });

  it("reads clipboard text only from explicit shortcut/button handling and cleans up registration", () => {
    expect(mainSource).toContain('data-action="add-from-clipboard"');
    expect(mainSource).toContain("async function handleAddFromClipboard(globalInvocation: boolean)");
    expect(mainSource).toContain("readText,");
    expect(mainSource).toContain("void globalShortcutRegistration.dispose()");
    expect(mainSource).toContain('await invoke("show_main_window_for_shortcut")');
  });
});
