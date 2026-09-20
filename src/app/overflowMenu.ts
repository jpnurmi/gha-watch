export type OverflowMenuItem =
  | {
      action: "toggle-autostart";
      checked: boolean;
      checkbox: "checked" | "empty";
      disabled: boolean;
      kind: "checkbox";
      label: string;
    }
  | {
      action: "clear-done";
      disabled: boolean;
      kind: "action";
      label: string;
    };

export type OverflowMenuOptions = {
  autoStartEnabled: boolean;
  autoStartBusy: boolean;
  hasWatches: boolean;
  isDoneView: boolean;
};

export function getOverflowMenuItems(options: OverflowMenuOptions): OverflowMenuItem[] {
  const triageActions: OverflowMenuItem[] = options.isDoneView
    ? [
        {
          action: "clear-done",
          disabled: !options.hasWatches,
          kind: "action",
          label: "Clear all done",
        },
      ]
    : [];

  return [
    ...triageActions,
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
