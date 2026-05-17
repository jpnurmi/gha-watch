export type OverflowMenuItem =
  | {
      action: "toggle-autostart";
      checked: boolean;
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
  autoStartEnabled: boolean;
  autoStartBusy: boolean;
  hasWatches: boolean;
  hasFinishedWatches: boolean;
};

export function getOverflowMenuItems(options: OverflowMenuOptions): OverflowMenuItem[] {
  return [
    {
      action: "toggle-autostart",
      checked: options.autoStartEnabled,
      disabled: options.autoStartBusy,
      kind: "checkbox",
      label: "Auto-start",
    },
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
  ];
}
