import { describe, expect, it } from "vitest";
import { getOverflowMenuItems } from "./overflowMenu";

describe("getOverflowMenuItems", () => {
  it("places the clear actions before the lower-frequency Auto-start setting", () => {
    expect(
      getOverflowMenuItems({
        autoStartEnabled: true,
        autoStartBusy: false,
        hasWatches: true,
        hasFinishedWatches: true,
      }).map((item) => item.action),
    ).toEqual(["clear-all", "clear-finished", "toggle-autostart"]);
  });

  it("shows Auto-start as a checkable menu item", () => {
    expect(
      getOverflowMenuItems({
        autoStartEnabled: true,
        autoStartBusy: false,
        hasWatches: true,
        hasFinishedWatches: true,
      })[2],
    ).toEqual({
      action: "toggle-autostart",
      checked: true,
      checkbox: "checked",
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
      {
        action: "toggle-autostart",
        checked: false,
        checkbox: "empty",
        disabled: true,
        kind: "checkbox",
        label: "Auto-start",
      },
    ]);
  });
});
