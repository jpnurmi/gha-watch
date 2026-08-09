import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getWatchTriageActions } from "./watchTriage";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("getWatchTriageActions", () => {
  it("offers save and done actions from the inbox", () => {
    expect(getWatchTriageActions("inbox")).toEqual([
      { label: "Save", state: "saved" },
      { label: "Done", state: "done" },
    ]);
  });

  it("offers inbox and done actions from saved", () => {
    expect(getWatchTriageActions("saved")).toEqual([
      { label: "Move to inbox", state: "inbox" },
      { label: "Done", state: "done" },
    ]);
  });

  it("offers inbox and save actions from done", () => {
    expect(getWatchTriageActions("done")).toEqual([
      { label: "Move to inbox", state: "inbox" },
      { label: "Save", state: "saved" },
    ]);
  });

  it("renders a compact view switcher and direct triage actions", () => {
    expect(mainSource).toContain('class="watch-view-switcher"');
    expect(mainSource).toContain('data-action="select-watch-view"');
    expect(mainSource).toContain('data-action="triage-watch"');
    expect(mainSource).toContain('data-action="clear-done-watch"');
    expect(mainSource).toContain('title="Remove from Done"');
    expect(mainSource).toContain("renderTriageButtons(currentWatchView, node.rowIds");
    expect(mainSource).toContain("renderTriageButtons(row.triageState, [row.id]");
    expect(mainSource).not.toContain('title="Remove"');
    expect(styles).toMatch(/\.watch-view-switcher\s*\{[^}]*display:\s*inline-flex;/s);
    expect(styles).toMatch(/\.watch-triage-button\s*\{[^}]*color:\s*rgb\(238 241 245 \/ 60%\);/s);
    expect(styles).toMatch(/\.watch-clear-done-button\s*\{[^}]*color:\s*#ff7b72;/s);
  });
});
