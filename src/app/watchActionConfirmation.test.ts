import { describe, expect, it } from "vitest";
import { isWatchActionConfirmation, shouldDismissPendingWatchActionOnRowLeave } from "./watchActionConfirmation";

describe("isWatchActionConfirmation", () => {
  it("only lets explicit confirmation actions pass through", () => {
    expect(isWatchActionConfirmation("confirm-remove")).toBe(true);
    expect(isWatchActionConfirmation("confirm-rerun")).toBe(true);
    expect(isWatchActionConfirmation("arm-remove")).toBe(false);
    expect(isWatchActionConfirmation("arm-rerun")).toBe(false);
    expect(isWatchActionConfirmation("open")).toBe(false);
    expect(isWatchActionConfirmation(undefined)).toBe(false);
  });
});

describe("shouldDismissPendingWatchActionOnRowLeave", () => {
  it("dismisses remove and re-run confirmations when the pointer leaves their row", () => {
    expect(shouldDismissPendingWatchActionOnRowLeave({ id: "run-123", kind: "remove" }, "run-123")).toBe(true);
    expect(shouldDismissPendingWatchActionOnRowLeave({ id: "run-123", kind: "rerun" }, "run-123")).toBe(true);
  });

  it("keeps confirmations when another row or no active row is left", () => {
    expect(shouldDismissPendingWatchActionOnRowLeave({ id: "run-123", kind: "remove" }, "run-456")).toBe(false);
    expect(shouldDismissPendingWatchActionOnRowLeave({ id: "run-123", kind: "remove" }, undefined)).toBe(false);
    expect(shouldDismissPendingWatchActionOnRowLeave(undefined, "run-123")).toBe(false);
  });
});
