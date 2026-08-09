export type OverflowMenuItem =
  | {
      action: "toggle-auto-clear-finished" | "toggle-autostart";
      checked: boolean;
      checkbox: "checked" | "empty";
      disabled: boolean;
      kind: "checkbox";
      label: string;
    }
  | {
      action: "clear-done" | "done-all" | "done-finished";
      disabled: boolean;
      kind: "action";
      label: string;
    };

export type OverflowMenuOptions = {
  autoClearFinishedWatches: boolean;
  autoStartEnabled: boolean;
  autoStartBusy: boolean;
  hasWatches: boolean;
  hasFinishedWatches: boolean;
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
    : [
        {
          action: "done-all",
          disabled: !options.hasWatches,
          kind: "action",
          label: "Mark all done",
        },
        {
          action: "done-finished",
          disabled: !options.hasFinishedWatches,
          kind: "action",
          label: "Mark finished done",
        },
      ];

  return [
    ...triageActions,
    {
      action: "toggle-auto-clear-finished",
      checked: options.autoClearFinishedWatches,
      checkbox: options.autoClearFinishedWatches ? "checked" : "empty",
      disabled: false,
      kind: "checkbox",
      label: "Auto-done",
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
