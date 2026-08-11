import type { RerunMode } from "../platform/gh";

export type WatchActionKind = "rerun";

export type PendingWatchAction = {
  id: string;
  kind: WatchActionKind;
};

export function getWatchRerunMode(action: string | undefined): RerunMode | undefined {
  if (action === "rerun-all") {
    return "all";
  }

  return action === "rerun-failed" ? "failed" : undefined;
}

export function shouldDismissPendingWatchActionOnRowLeave(
  pendingAction: PendingWatchAction | undefined,
  rowId: string | undefined,
): boolean {
  return pendingAction !== undefined && pendingAction.id === rowId;
}
