import { describe, expect, it } from "vitest";
import { getOverflowMenuItems } from "./overflowMenu";

describe("getOverflowMenuItems", () => {
  it("shows Auto-start as a checkable menu item", () => {
    expect(
      getOverflowMenuItems({
        autoStartEnabled: true,
        autoStartBusy: false,
        hasWatches: true,
        hasFinishedWatches: true,
      })[0],
    ).toEqual({
      action: "toggle-autostart",
      checked: true,
      disabled: false,
      kind: "checkbox",
      label: "Auto-start",
    });
  });

  it("keeps destructive clear actions disabled until they apply", () => {
    expect(
      getOverflowMenuItems({
        autoStartEnabled: false,
        autoStartBusy: true,
        hasWatches: false,
        hasFinishedWatches: false,
      }),
    ).toEqual([
      {
        action: "toggle-autostart",
        checked: false,
        disabled: true,
        kind: "checkbox",
        label: "Auto-start",
      },
      {
        action: "clear-all",
        disabled: true,
        kind: "action",
        label: "Clear all",
      },
      {
        action: "clear-finished",
        disabled: true,
        kind: "action",
        label: "Clear finished",
      },
    ]);
  });
});
