import { describe, expect, it } from "vitest";
import {
  getAdjacentIndex,
  getAdjacentWatchView,
  getPopupEscapeLayer,
  getReorderAnnouncement,
  getReorderTargetIndex,
  shouldHandleLocalShortcut,
} from "./popupKeyboard";

describe("popup keyboard behavior", () => {
  it("dismisses the innermost popup layer first", () => {
    expect(getPopupEscapeLayer({ addOpen: true, dragActive: true, popoverOpen: true })).toBe("drag");
    expect(getPopupEscapeLayer({ addOpen: true, dragActive: false, popoverOpen: true })).toBe("popover");
    expect(getPopupEscapeLayer({ addOpen: true, dragActive: false, popoverOpen: false })).toBe("add");
    expect(getPopupEscapeLayer({ addOpen: false, dragActive: false, popoverOpen: false })).toBe("popup");
  });

  it("wraps menu and tab navigation", () => {
    expect(getAdjacentIndex(0, 3, "up", true)).toBe(2);
    expect(getAdjacentIndex(2, 3, "down", true)).toBe(0);
    expect(getAdjacentWatchView("inbox", "left")).toBe("done");
    expect(getAdjacentWatchView("done", "right")).toBe("inbox");
  });

  it("does not wrap keyboard reordering", () => {
    expect(getReorderTargetIndex(0, 3, "up")).toBeUndefined();
    expect(getReorderTargetIndex(0, 3, "down")).toBe(1);
    expect(getReorderTargetIndex(2, 3, "down")).toBeUndefined();
  });

  it("announces a useful resulting position", () => {
    expect(getReorderAnnouncement("getsentry/sentry", "repository", 2, 4)).toBe(
      "Repository getsentry/sentry moved to position 2 of 4.",
    );
    expect(getReorderAnnouncement("CI", "watch", 1, 3)).toBe(
      "Watch CI moved to position 1 of 3.",
    );
  });

  it("does not handle local shortcuts while typing or using system modifiers", () => {
    expect(
      shouldHandleLocalShortcut({ altKey: false, ctrlKey: false, metaKey: false, textEntry: false }),
    ).toBe(true);
    expect(
      shouldHandleLocalShortcut({ altKey: false, ctrlKey: false, metaKey: false, textEntry: true }),
    ).toBe(false);
    expect(
      shouldHandleLocalShortcut({ altKey: false, ctrlKey: false, metaKey: true, textEntry: false }),
    ).toBe(false);
  });
});
