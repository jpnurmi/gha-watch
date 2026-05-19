import type { WatchTreeNodeViewModel } from "./viewModel";

export type WatchTreeNodeRemoveMode = "remove" | "ignore-pr-workflow";

export type PendingWatchTreeAction = {
  mode: WatchTreeNodeRemoveMode;
  nodeId: string;
  rowIds: string[];
};

export function canRemoveWatchTreeNode(
  node: Pick<WatchTreeNodeViewModel, "rowIds">,
  _depth: number,
): boolean {
  return node.rowIds.length > 0;
}

export function getWatchTreeNodeRemoveMode(
  node: Pick<WatchTreeNodeViewModel, "kind">,
  depth: number,
): WatchTreeNodeRemoveMode {
  return node.kind === "workflow" && depth > 0 ? "ignore-pr-workflow" : "remove";
}

export function shouldDismissPendingTreeActionOnHeaderLeave(
  pendingAction: PendingWatchTreeAction | undefined,
  nodeId: string | undefined,
): boolean {
  return pendingAction !== undefined && pendingAction.nodeId === nodeId;
}
