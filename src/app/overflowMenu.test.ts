import { describe, expect, it } from "vitest";
import { getOverflowMenuItems } from "./overflowMenu";

describe("getOverflowMenuItems", () => {
  it("only offers settings outside the Done view", () => {
    expect(
      getOverflowMenuItems({
        autoStartEnabled: true,
        autoStartBusy: false,
        hasWatches: true,
        isDoneView: false,
      }).map((item) => item.action),
    ).toEqual(["toggle-autostart"]);
  });

  it("shows Auto-start as a checkable menu item", () => {
    expect(
      getOverflowMenuItems({
        autoStartEnabled: false,
        autoStartBusy: false,
        hasWatches: true,
        isDoneView: false,
      }),
    ).toEqual([
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

  it("disables Auto-start while loading", () => {
    expect(
      getOverflowMenuItems({
        autoStartEnabled: false,
        autoStartBusy: true,
        hasWatches: false,
        isDoneView: false,
      }),
    ).toEqual([
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
      autoStartEnabled: false,
      autoStartBusy: false,
      hasWatches: true,
      isDoneView: true,
    });

    expect(items.map((item) => item.action)).toEqual(["clear-done", "toggle-autostart"]);
    expect(items[0]).toMatchObject({ label: "Clear all done" });
  });
});
