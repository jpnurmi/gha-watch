export type OverflowMenuItem =
  | {
      action: "toggle-auto-clear-merged-prs" | "toggle-autostart";
      checked: boolean;
      checkbox: "checked" | "empty";
      disabled: boolean;
      kind: "checkbox";
      label: string;
    }
  | {
      action: "clear-all" | "clear-finished";
      disabled: boolean;
      kind: "action";
      label: string;
    };

export type OverflowMenuOptions = {
  autoClearMergedPrWatches: boolean;
  autoStartEnabled: boolean;
  autoStartBusy: boolean;
  hasWatches: boolean;
  hasFinishedWatches: boolean;
};

export function getOverflowMenuItems(options: OverflowMenuOptions): OverflowMenuItem[] {
  return [
    {
      action: "clear-all",
      disabled: !options.hasWatches,
      kind: "action",
      label: "Clear all",
    },
    {
      action: "clear-finished",
      disabled: !options.hasFinishedWatches,
      kind: "action",
      label: "Clear finished",
    },
    {
      action: "toggle-auto-clear-merged-prs",
      checked: options.autoClearMergedPrWatches,
      checkbox: options.autoClearMergedPrWatches ? "checked" : "empty",
      disabled: false,
      kind: "checkbox",
      label: "Auto-clear",
    },
    {
      action: "toggle-autostart",
      checked: options.autoStartEnabled,
      checkbox: options.autoStartEnabled ? "checked" : "empty",
      disabled: options.autoStartBusy,
      kind: "checkbox",
      label: "Auto-start",
    },
  ];
}
