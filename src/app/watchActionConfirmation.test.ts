import { describe, expect, it } from "vitest";
import { isWatchActionConfirmation } from "./watchActionConfirmation";

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
