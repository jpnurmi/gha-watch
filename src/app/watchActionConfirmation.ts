export type WatchActionKind = "remove" | "ignore-pr-workflow" | "rerun";

export type PendingWatchAction = {
  id: string;
  kind: WatchActionKind;
};

export function isWatchActionConfirmation(action: string | undefined): boolean {
  return action === "confirm-remove" || action === "confirm-ignore-pr-workflow" || action === "confirm-rerun";
}

export function shouldDismissPendingWatchActionOnRowLeave(
  pendingAction: PendingWatchAction | undefined,
  rowId: string | undefined,
): boolean {
  return pendingAction !== undefined && pendingAction.id === rowId;
}
