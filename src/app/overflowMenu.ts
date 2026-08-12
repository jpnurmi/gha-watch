export type OverflowMenuItem =
  | {
      action: "toggle-autostart" | "toggle-global-add-shortcut";
      checked: boolean;
      checkbox: "checked" | "empty";
      disabled: boolean;
      kind: "checkbox";
      label: string;
    }
  | {
      action: "add-from-clipboard" | "clear-done" | "done-all" | "done-finished";
      disabled: boolean;
      kind: "action";
      label: string;
    };

export type OverflowMenuOptions = {
  autoStartEnabled: boolean;
  autoStartBusy: boolean;
  globalAddShortcutEnabled: boolean;
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
    {
      action: "add-from-clipboard",
      disabled: false,
      kind: "action",
      label: "Add from clipboard",
    },
    ...triageActions,
    {
      action: "toggle-autostart",
      checked: options.autoStartEnabled,
      checkbox: options.autoStartEnabled ? "checked" : "empty",
      disabled: options.autoStartBusy,
      kind: "checkbox",
      label: "Auto-start",
    },
    {
      action: "toggle-global-add-shortcut",
      checked: options.globalAddShortcutEnabled,
      checkbox: options.globalAddShortcutEnabled ? "checked" : "empty",
      disabled: false,
      kind: "checkbox",
      label: "Global add shortcut",
    },
  ];
}
