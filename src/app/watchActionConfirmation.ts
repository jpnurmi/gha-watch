export type WatchActionKind = "remove" | "rerun";

export type PendingWatchAction = {
  id: string;
  kind: WatchActionKind;
};

export function isWatchActionConfirmation(action: string | undefined): boolean {
  return action === "confirm-remove" || action === "confirm-rerun";
}

export function shouldDismissPendingWatchActionOnRowLeave(
  pendingAction: PendingWatchAction | undefined,
  rowId: string | undefined,
): boolean {
  return pendingAction !== undefined && pendingAction.id === rowId;
}
