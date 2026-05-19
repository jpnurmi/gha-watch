import type { CheckWatchTarget, JobWatchTarget, PrWatchTarget, RunWatchTarget } from "./githubUrl";
import type { WatchState } from "./status";

export type PrSourceState = "draft" | "ready" | "merged" | "closed";

export type PrWatchResolution = {
  targets: CheckWatchTarget[];
  targetMetadata?: Record<string, WatchMetadata>;
  sourceState: PrSourceState;
};

export type RunWatchResolution = {
  targets: JobWatchTarget[];
  targetMetadata?: Record<string, WatchMetadata>;
};

export type WatchTiming = {
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
};

export type WatchMetadata = {
  prTitle?: string;
  workflowName?: string;
  runTitle?: string;
  jobName?: string;
};

export type WatchRecord = {
  id: string;
  target: CheckWatchTarget;
  source?: PrWatchTarget;
  sourceRun?: RunWatchTarget;
  sourceState?: PrSourceState;
  ignoredTargetIds?: string[];
  ignoredWorkflowNames?: string[];
  label: string;
  metadata?: WatchMetadata;
  repoIconUrl?: string;
  status: string;
  lastSeenStatus?: string;
  lastState: WatchState | undefined;
  timing?: WatchTiming;
  active: boolean;
  error: string | undefined;
};

export type WatchDropPosition = "before" | "after";

export function getWatchId(target: CheckWatchTarget): string {
  if (target.kind === "run") {
    return `${target.owner}/${target.repo}/run/${target.runId}`;
  }

  return `${target.owner}/${target.repo}/job/${target.jobId}`;
}

export function getWatchLabel(target: CheckWatchTarget): string {
  if (target.kind === "run") {
    return `${target.owner}/${target.repo}#${target.runId}`;
  }

  return `${target.owner}/${target.repo} job #${target.jobId}`;
}

export function addWatch(
  watches: WatchRecord[],
  target: CheckWatchTarget,
  source?: PrWatchTarget,
  sourceState?: PrSourceState,
  metadata?: WatchMetadata,
  ignoredWorkflowNames?: string[],
  ignoredTargetIds?: string[],
  sourceRun?: RunWatchTarget,
): WatchRecord[] {
  const id = getWatchId(target);

  if (watches.some((watch) => watch.id === id)) {
    return watches;
  }

  return [
    ...watches,
    {
      id,
      target,
      ...(source ? { source } : {}),
      ...(sourceRun ? { sourceRun } : {}),
      ...(sourceState ? { sourceState } : {}),
      ...(ignoredTargetIds?.length ? { ignoredTargetIds } : {}),
      ...(ignoredWorkflowNames?.length ? { ignoredWorkflowNames } : {}),
      label: getWatchLabel(target),
      ...(metadata ? { metadata } : {}),
      status: "pending",
      lastSeenStatus: "pending",
      lastState: undefined,
      active: true,
      error: undefined,
    },
  ];
}

export function removeWatch(watches: WatchRecord[], id: string): WatchRecord[] {
  return watches.filter((watch) => watch.id !== id);
}

export function moveWatchWithinRepo(
  watches: WatchRecord[],
  draggedId: string,
  targetId: string,
  position: WatchDropPosition,
): WatchRecord[] {
  return moveWatchGroupWithinRepo(watches, [draggedId], [targetId], position);
}

export function moveWatchGroupWithinRepo(
  watches: WatchRecord[],
  draggedIds: string[],
  targetIds: string[],
  position: WatchDropPosition,
): WatchRecord[] {
  const draggedIdSet = toNonEmptyIdSet(draggedIds);
  const targetIdSet = toNonEmptyIdSet(targetIds);

  if (!draggedIdSet || !targetIdSet || setsOverlap(draggedIdSet, targetIdSet)) {
    return watches;
  }

  const draggedWatch = watches.find((watch) => draggedIdSet.has(watch.id));
  const targetWatch = watches.find((watch) => targetIdSet.has(watch.id));

  if (!draggedWatch || !targetWatch || !isSameWatchRepo(draggedWatch, targetWatch)) {
    return watches;
  }

  const repoIndices: number[] = [];
  const repoWatches: WatchRecord[] = [];

  watches.forEach((watch, index) => {
    if (isSameWatchRepo(watch, draggedWatch)) {
      repoIndices.push(index);
      repoWatches.push(watch);
    }
  });

  if (!allIdsAreInRepo(draggedIdSet, repoWatches) || !allIdsAreInRepo(targetIdSet, repoWatches)) {
    return watches;
  }

  const reorderedRepoWatches = moveWatchGroupInList(repoWatches, draggedIdSet, targetIdSet, position);

  if (reorderedRepoWatches === repoWatches) {
    return watches;
  }

  const nextWatches = [...watches];
  let changed = false;

  repoIndices.forEach((watchIndex, repoIndex) => {
    if (nextWatches[watchIndex].id !== reorderedRepoWatches[repoIndex].id) {
      changed = true;
    }

    nextWatches[watchIndex] = reorderedRepoWatches[repoIndex];
  });

  return changed ? nextWatches : watches;
}

export function markWatchSeen(watches: WatchRecord[], id: string): WatchRecord[] {
  return watches.map((watch) => (watch.id === id ? { ...watch, lastSeenStatus: watch.status } : watch));
}

export function markAllWatchesSeen(watches: WatchRecord[]): WatchRecord[] {
  return watches.map((watch) => ({ ...watch, lastSeenStatus: watch.status }));
}

export function normalizeWatchSeenStatus(watch: WatchRecord): WatchRecord {
  return {
    ...watch,
    lastSeenStatus: watch.lastSeenStatus ?? watch.status,
  };
}

export function hasUnseenStatusChange(watch: WatchRecord): boolean {
  return Boolean(watch.lastSeenStatus && watch.status !== watch.lastSeenStatus);
}

function moveWatchGroupInList(
  watches: WatchRecord[],
  draggedIdSet: Set<string>,
  targetIdSet: Set<string>,
  position: WatchDropPosition,
): WatchRecord[] {
  const draggedWatches = watches.filter((watch) => draggedIdSet.has(watch.id));
  const nextWatches = watches.filter((watch) => !draggedIdSet.has(watch.id));
  const targetIndexes = nextWatches
    .map((watch, index) => (targetIdSet.has(watch.id) ? index : undefined))
    .filter((index): index is number => index !== undefined);

  if (draggedWatches.length !== draggedIdSet.size || targetIndexes.length !== targetIdSet.size) {
    return watches;
  }

  const insertionIndex =
    position === "after" ? Math.max(...targetIndexes) + 1 : Math.min(...targetIndexes);
  nextWatches.splice(insertionIndex, 0, ...draggedWatches);
  return watchIdsAreEqual(nextWatches, watches) ? watches : nextWatches;
}

function toNonEmptyIdSet(ids: string[]): Set<string> | undefined {
  const cleanIds = ids.map((id) => id.trim()).filter((id) => id.length > 0);
  return cleanIds.length > 0 ? new Set(cleanIds) : undefined;
}

function setsOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const item of left) {
    if (right.has(item)) {
      return true;
    }
  }

  return false;
}

function allIdsAreInRepo(ids: Set<string>, repoWatches: WatchRecord[]): boolean {
  const repoIds = new Set(repoWatches.map((watch) => watch.id));

  for (const id of ids) {
    if (!repoIds.has(id)) {
      return false;
    }
  }

  return true;
}

function isSameWatchRepo(left: WatchRecord, right: WatchRecord): boolean {
  return left.target.owner === right.target.owner && left.target.repo === right.target.repo;
}

function watchIdsAreEqual(left: WatchRecord[], right: WatchRecord[]): boolean {
  return left.length === right.length && left.every((watch, index) => watch.id === right[index].id);
}
