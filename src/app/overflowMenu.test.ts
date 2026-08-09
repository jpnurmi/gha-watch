import { describe, expect, it } from "vitest";
import { getOverflowMenuItems } from "./overflowMenu";

describe("getOverflowMenuItems", () => {
  it("places done actions before lower-frequency settings", () => {
    expect(
      getOverflowMenuItems({
        autoClearFinishedWatches: true,
        autoStartEnabled: true,
        autoStartBusy: false,
        hasWatches: true,
        hasFinishedWatches: true,
        isDoneView: false,
      }).map((item) => item.action),
    ).toEqual(["done-all", "done-finished", "toggle-auto-clear-finished", "toggle-autostart"]);
  });

  it("shows Auto-done and Auto-start as checkable menu items", () => {
    expect(
      getOverflowMenuItems({
        autoClearFinishedWatches: true,
        autoStartEnabled: false,
        autoStartBusy: false,
        hasWatches: true,
        hasFinishedWatches: true,
        isDoneView: false,
      }).slice(2),
    ).toEqual([
      {
        action: "toggle-auto-clear-finished",
        checked: true,
        checkbox: "checked",
        disabled: false,
        kind: "checkbox",
        label: "Auto-done",
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

  it("keeps done actions disabled until they apply and disables Auto-start while loading", () => {
    expect(
      getOverflowMenuItems({
        autoClearFinishedWatches: false,
        autoStartEnabled: false,
        autoStartBusy: true,
        hasWatches: false,
        hasFinishedWatches: false,
        isDoneView: false,
      }),
    ).toEqual([
      {
        action: "done-all",
        disabled: true,
        kind: "action",
        label: "Mark all done",
      },
      {
        action: "done-finished",
        disabled: true,
        kind: "action",
        label: "Mark finished done",
      },
      {
        action: "toggle-auto-clear-finished",
        checked: false,
        checkbox: "empty",
        disabled: false,
        kind: "checkbox",
        label: "Auto-done",
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

  it("offers manual clearing in the Done view", () => {
    const items = getOverflowMenuItems({
      autoClearFinishedWatches: false,
      autoStartEnabled: false,
      autoStartBusy: false,
      hasWatches: true,
      hasFinishedWatches: false,
      isDoneView: true,
    });

    expect(items.map((item) => item.action)).toEqual([
      "clear-done",
      "toggle-auto-clear-finished",
      "toggle-autostart",
    ]);
    expect(items[0]).toMatchObject({ label: "Clear all done" });
  });
});
