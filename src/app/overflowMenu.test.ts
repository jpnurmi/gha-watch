import { describe, expect, it } from "vitest";
import { getOverflowMenuItems } from "./overflowMenu";

describe("getOverflowMenuItems", () => {
  it("places done actions before lower-frequency settings", () => {
    expect(
      getOverflowMenuItems({
        autoStartEnabled: true,
        autoStartBusy: false,
        globalAddShortcutEnabled: false,
        hasWatches: true,
        hasFinishedWatches: true,
        isDoneView: false,
      }).map((item) => item.action),
    ).toEqual(["add-from-clipboard", "done-all", "done-finished", "toggle-autostart", "toggle-global-add-shortcut"]);
  });

  it("shows Auto-start as a checkable menu item", () => {
    expect(
      getOverflowMenuItems({
        autoStartEnabled: false,
        autoStartBusy: false,
        globalAddShortcutEnabled: false,
        hasWatches: true,
        hasFinishedWatches: true,
        isDoneView: false,
      }).slice(3),
    ).toEqual([
      {
        action: "toggle-autostart",
        checked: false,
        checkbox: "empty",
        disabled: false,
        kind: "checkbox",
        label: "Auto-start",
      },
      {
        action: "toggle-global-add-shortcut",
        checked: false,
        checkbox: "empty",
        disabled: false,
        kind: "checkbox",
        label: "Global add shortcut",
      },
    ]);
  });

  it("keeps done actions disabled until they apply and disables Auto-start while loading", () => {
    expect(
      getOverflowMenuItems({
        autoStartEnabled: false,
        autoStartBusy: true,
        globalAddShortcutEnabled: false,
        hasWatches: false,
        hasFinishedWatches: false,
        isDoneView: false,
      }),
    ).toEqual([
      {
        action: "add-from-clipboard",
        disabled: false,
        kind: "action",
        label: "Add from clipboard",
      },
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
        action: "toggle-autostart",
        checked: false,
        checkbox: "empty",
        disabled: true,
        kind: "checkbox",
        label: "Auto-start",
      },
      {
        action: "toggle-global-add-shortcut",
        checked: false,
        checkbox: "empty",
        disabled: false,
        kind: "checkbox",
        label: "Global add shortcut",
      },
    ]);
  });

  it("offers manual clearing in the Done view", () => {
    const items = getOverflowMenuItems({
      autoStartEnabled: false,
      autoStartBusy: false,
      globalAddShortcutEnabled: false,
      hasWatches: true,
      hasFinishedWatches: false,
      isDoneView: true,
    });

    expect(items.map((item) => item.action)).toEqual([
      "add-from-clipboard",
      "clear-done",
      "toggle-autostart",
      "toggle-global-add-shortcut",
    ]);
    expect(items[1]).toMatchObject({ label: "Clear all done" });
  });
});
