import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isWatchActionConfirmation, shouldDismissPendingWatchActionOnRowLeave } from "./watchActionConfirmation";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("isWatchActionConfirmation", () => {
  it("only lets explicit confirmation actions pass through", () => {
    expect(isWatchActionConfirmation("confirm-remove")).toBe(false);
    expect(isWatchActionConfirmation("confirm-ignore-pr-workflow")).toBe(false);
    expect(isWatchActionConfirmation("confirm-rerun")).toBe(true);
    expect(isWatchActionConfirmation("arm-remove")).toBe(false);
    expect(isWatchActionConfirmation("arm-ignore-pr-workflow")).toBe(false);
    expect(isWatchActionConfirmation("arm-rerun")).toBe(false);
    expect(isWatchActionConfirmation("open")).toBe(false);
    expect(isWatchActionConfirmation(undefined)).toBe(false);
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

describe("watch action confirmation layout", () => {
  it("overlays row actions without reserving title width", () => {
    expect(styles).toMatch(
      /\.watch\s*\{[^}]*grid-template-columns:\s*var\(--tree-leading-width\) minmax\(0,\s*1fr\);/s,
    );
    expect(styles).not.toMatch(
      /\.watch\.has-actions\s*\{[^}]*grid-template-columns:[^}]*var\(--tree-actions-width\);/s,
    );
    expect(styles).toMatch(
      /\.watch-actions\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*1;[^}]*top:\s*8px;[^}]*right:\s*calc\(6px \+ var\(--scrollbar-gutter-width\)\);[^}]*width:\s*var\(--tree-actions-width\);[^}]*padding-right:\s*0;/s,
    );
    expect(styles).not.toMatch(/\.watch\.has-actions \.watch-actions\s*\{[^}]*position:\s*relative;/s);
    expect(styles).toMatch(
      /\.watch\.has-confirmation \.confirm-button\s*\{[^}]*position:\s*absolute;[^}]*top:\s*1px;[^}]*right:\s*0;[^}]*z-index:\s*1;[^}]*height:\s*18px;[^}]*margin-top:\s*0;/s,
    );
    expect(styles).toMatch(
      /\.watch\.has-actions \.watch-actions::before\s*\{[^}]*right:\s*0;[^}]*width:\s*84px;[^}]*background:\s*linear-gradient\(90deg, transparent, var\(--watch-row-bg\) 24px\);[^}]*opacity:\s*0;/s,
    );
    expect(styles).toMatch(
      /\.watch\.has-actions:hover \.watch-actions::before,[^{]*\.watch\.has-actions:focus-within \.watch-actions::before,[^{]*\.watch\.has-confirmation \.watch-actions::before\s*\{[^}]*opacity:\s*1;/s,
    );
  });
});
