import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getWatchTriageActions } from "./watchTriage";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("getWatchTriageActions", () => {
  it("offers drafts and done actions from the inbox", () => {
    expect(getWatchTriageActions("inbox")).toEqual([
      { label: "Move to Drafts", state: "saved" },
      { label: "Done", state: "done" },
    ]);
  });

  it("offers inbox and done actions from saved", () => {
    expect(getWatchTriageActions("saved")).toEqual([
      { label: "Move to Inbox", state: "inbox" },
      { label: "Done", state: "done" },
    ]);
  });

  it("offers inbox and drafts actions from done", () => {
    expect(getWatchTriageActions("done")).toEqual([
      { label: "Move to Inbox", state: "inbox" },
      { label: "Move to Drafts", state: "saved" },
    ]);
  });

  it("renders a compact view switcher and direct triage actions", () => {
    expect(styles).toMatch(/\.watch-view-switcher\s*\{[^}]*display:\s*inline-flex;/s);
    expect(styles).toMatch(/\.watch-triage-button\s*\{[^}]*color:\s*rgb\(238 241 245 \/ 60%\);/s);
    expect(styles).toMatch(/\.watch-clear-done-button\s*\{[^}]*color:\s*#ff7b72;/s);
  });
});
