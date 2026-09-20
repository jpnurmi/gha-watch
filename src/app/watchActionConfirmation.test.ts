import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getWatchRerunMode } from "./watchActionConfirmation";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

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

describe("watch action menu layout", () => {
  it("aligns row actions with the title and keeps the dropdown above other rows", () => {
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
      /\.watch\.has-open-menu \.watch-actions\s*\{[^}]*z-index:\s*20;/s,
    );
    expect(styles).toMatch(
      /\.watch-menu-control\s*\{[^}]*display:\s*inline-grid;[^}]*width:\s*18px;[^}]*height:\s*18px;/s,
    );
    expect(styles).toMatch(
      /\.watch-menu-popover\s*\{[^}]*width:\s*max-content;[^}]*min-width:\s*156px;[^}]*max-height:\s*calc\(100vh - 16px\);/s,
    );
    expect(styles).toMatch(
      /\.watch:hover \.watch-action-button,[^{]*\.watch:focus-within \.watch-action-button,[^{]*\.watch-action-button\[aria-expanded="true"\]\s*\{[^}]*visibility:\s*visible;[^}]*pointer-events:\s*auto;/s,
    );
    expect(styles).toMatch(
      /\.watch\.has-actions \.watch-actions::before\s*\{[^}]*right:\s*0;[^}]*width:\s*64px;[^}]*background:\s*linear-gradient\(90deg, transparent, var\(--watch-row-bg\) 24px\);[^}]*opacity:\s*0;/s,
    );
    expect(styles).toMatch(
      /\.watch\.has-actions:hover \.watch-actions::before,[^{]*\.watch\.has-actions:focus-within \.watch-actions::before,[^{]*\.watch\.has-open-menu \.watch-actions::before\s*\{[^}]*opacity:\s*1;/s,
    );
  });
});
