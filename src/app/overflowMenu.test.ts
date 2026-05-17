import { describe, expect, it } from "vitest";
import { getOverflowMenuItems } from "./overflowMenu";

describe("getOverflowMenuItems", () => {
  it("places clear actions before lower-frequency settings", () => {
    expect(
      getOverflowMenuItems({
        autoClearMergedPrWatches: true,
        autoStartEnabled: true,
        autoStartBusy: false,
        hasWatches: true,
        hasFinishedWatches: true,
      }).map((item) => item.action),
    ).toEqual(["clear-all", "clear-finished", "toggle-auto-clear-merged-prs", "toggle-autostart"]);
  });

  it("shows Auto-clear and Auto-start as checkable menu items", () => {
    expect(
      getOverflowMenuItems({
        autoClearMergedPrWatches: true,
        autoStartEnabled: false,
        autoStartBusy: false,
        hasWatches: true,
        hasFinishedWatches: true,
      }).slice(2),
    ).toEqual([
      {
        action: "toggle-auto-clear-merged-prs",
        checked: true,
        checkbox: "checked",
        disabled: false,
        kind: "checkbox",
        label: "Auto-clear",
      },
      {
        action: "toggle-autostart",
        checked: false,
        checkbox: "empty",
        disabled: false,
        kind: "checkbox",
        label: "Auto-start",
      },
    ]);
  });

  it("keeps clear actions disabled until they apply and disables Auto-start while loading", () => {
    expect(
      getOverflowMenuItems({
        autoClearMergedPrWatches: false,
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
        action: "toggle-auto-clear-merged-prs",
        checked: false,
        checkbox: "empty",
        disabled: false,
        kind: "checkbox",
        label: "Auto-clear",
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
