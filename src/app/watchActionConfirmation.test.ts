import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getWatchRerunMode, shouldDismissPendingWatchActionOnRowLeave } from "./watchActionConfirmation";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

describe("getWatchRerunMode", () => {
  it("parses only explicit rerun menu actions", () => {
    expect(getWatchRerunMode("rerun-all")).toBe("all");
    expect(getWatchRerunMode("rerun-failed")).toBe("failed");
    expect(getWatchRerunMode("confirm-rerun")).toBeUndefined();
    expect(getWatchRerunMode("arm-rerun")).toBeUndefined();
    expect(getWatchRerunMode("open")).toBeUndefined();
    expect(getWatchRerunMode(undefined)).toBeUndefined();
  });
});

describe("shouldDismissPendingWatchActionOnRowLeave", () => {
  it("dismisses re-run confirmations when the pointer leaves their row", () => {
    expect(shouldDismissPendingWatchActionOnRowLeave({ id: "run-123", kind: "rerun" }, "run-123")).toBe(true);
  });

  it("keeps confirmations when another row or no active row is left", () => {
    expect(shouldDismissPendingWatchActionOnRowLeave({ id: "run-123", kind: "rerun" }, "run-456")).toBe(false);
    expect(shouldDismissPendingWatchActionOnRowLeave({ id: "run-123", kind: "rerun" }, undefined)).toBe(false);
    expect(shouldDismissPendingWatchActionOnRowLeave(undefined, "run-123")).toBe(false);
  });
});

describe("watch rerun menu layout", () => {
  it("aligns row actions with the title and opens the menu below the button", () => {
    expect(styles).toMatch(
      /\.watch\s*\{[^}]*grid-template-columns:\s*var\(--tree-leading-width\) minmax\(0,\s*1fr\);/s,
    );
    expect(styles).not.toMatch(
      /\.watch\.has-actions\s*\{[^}]*grid-template-columns:[^}]*var\(--tree-actions-width\);/s,
    );
    expect(styles).toMatch(
      /\.watch-actions\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*1;[^}]*top:\s*5px;[^}]*right:\s*calc\(6px \+ var\(--scrollbar-gutter-width\)\);[^}]*width:\s*var\(--tree-actions-width\);[^}]*height:\s*18px;[^}]*padding-right:\s*0;/s,
    );
    expect(styles).not.toMatch(/\.watch\.has-actions \.watch-actions\s*\{[^}]*position:\s*relative;/s);
    expect(styles).toMatch(
      /\.watch\.has-confirmation \.watch-actions\s*\{[^}]*z-index:\s*20;/s,
    );
    expect(styles).toMatch(
      /\.watch-rerun-control\s*\{[^}]*display:\s*inline-grid;[^}]*width:\s*18px;[^}]*height:\s*18px;/s,
    );
    expect(styles).toMatch(
      /\.watch-rerun-popover\s*\{[^}]*width:\s*max-content;[^}]*min-width:\s*156px;[^}]*max-height:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.watch:hover \.watch-action-button,[^{]*\.watch:focus-within \.watch-action-button,[^{]*\.watch-action-button\[aria-expanded="true"\]\s*\{[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;/s,
    );
    expect(main).toContain(
      'class="repo-action-menu repo-action-menu-container watch-rerun-control"',
    );
    expect(main).toContain(
      'class="repo-action-popover watch-rerun-popover"',
    );
    expect(main).toContain(
      'class="repo-action-item"',
    );
    expect(styles).toMatch(
      /\.watch\.has-actions \.watch-actions::before\s*\{[^}]*right:\s*0;[^}]*width:\s*84px;[^}]*background:\s*linear-gradient\(90deg, transparent, var\(--watch-row-bg\) 24px\);[^}]*opacity:\s*0;/s,
    );
    expect(styles).toMatch(
      /\.watch\.has-actions:hover \.watch-actions::before,[^{]*\.watch\.has-actions:focus-within \.watch-actions::before,[^{]*\.watch\.has-confirmation \.watch-actions::before\s*\{[^}]*opacity:\s*1;/s,
    );
  });
});
