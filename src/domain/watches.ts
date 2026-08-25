import type { PrWatchTarget, RunWatchTarget, WatchTarget } from "./githubUrl";
import type { WatchState } from "./status";

export type PrSourceState = "draft" | "ready" | "merged" | "closed";
export type WatchTriageState = "inbox" | "saved" | "done";
export type WatchErrorKind = "transient";
export const watchRetentionMonths = 1;
export const doneWatchRetentionLimit = 100;

export type WatchTiming = {
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
};

export type WatchMetadata = {
  prTitle?: string;
  prUpdatedAt?: string;
  workflowName?: string;
  runTitle?: string;
  runNumber?: string;
  jobName?: string;
  branchName?: string;
  commitSha?: string;
};

export type WatchRecord = {
  id: string;
  target: WatchTarget;
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
  triageState?: WatchTriageState;
  doneAt?: string;
  active: boolean;
  error: string | undefined;
  errorKind?: WatchErrorKind;
  errorAt?: string;
};

export type WatchDropPosition = "before" | "after";

export function getWatchId(target: WatchTarget): string {
  if (target.kind === "pr") {
    return `${target.owner}/${target.repo}/pull/${target.prNumber}`;
  }

  if (target.kind === "run") {
    return `${target.owner}/${target.repo}/run/${target.runId}`;
  }

  return `${target.owner}/${target.repo}/job/${target.jobId}`;
}

export function getWatchLabel(target: WatchTarget): string {
  if (target.kind === "pr") {
    return `${target.owner}/${target.repo}#${target.prNumber}`;
  }

  if (target.kind === "run") {
    return `${target.owner}/${target.repo}#${target.runId}`;
  }

  return `${target.owner}/${target.repo} job #${target.jobId}`;
}

export function addWatch(
  watches: WatchRecord[],
  target: WatchTarget,
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

export function getWatchTriageState(
  watch: Pick<WatchRecord, "triageState">,
): WatchTriageState {
  return watch.triageState ?? "inbox";
}

export function setWatchesTriageState(
  watches: WatchRecord[],
  ids: string[],
  triageState: WatchTriageState,
  changedAt = new Date(),
): WatchRecord[] {
  const idSet = new Set(ids);
  let changed = false;

  const nextWatches = watches.map((watch) => {
    if (!idSet.has(watch.id) || getWatchTriageState(watch) === triageState) {
      return watch;
    }

    changed = true;
    const nextWatch: WatchRecord = {
      ...watch,
      triageState,
      ...(triageState === "done"
        ? {
            doneAt: changedAt.toISOString(),
            lastSeenStatus: watch.status,
          }
        : {}),
    };

    if (triageState !== "done") {
      delete nextWatch.doneAt;
    }

    return nextWatch;
  });

  return changed ? nextWatches : watches;
}

export function normalizeWatchDoneAt(watch: WatchRecord, now = new Date()): WatchRecord {
  if (getWatchTriageState(watch) === "done") {
    return watch.doneAt ? watch : { ...watch, doneAt: now.toISOString() };
  }

  if (!watch.doneAt) {
    return watch;
  }

  const nextWatch = { ...watch };
  delete nextWatch.doneAt;
  return nextWatch;
}

export function clearDoneWatches(watches: WatchRecord[], ids: string[]): WatchRecord[] {
  const idSet = new Set(ids);
  const nextWatches = watches.filter(
    (watch) => !idSet.has(watch.id) || getWatchTriageState(watch) !== "done",
  );
  return nextWatches.length === watches.length ? watches : nextWatches;
}

export function clearExpiredDoneWatches(
  watches: WatchRecord[],
  now = new Date(),
): WatchRecord[] {
  const nowMs = now.getTime();
  const retainedDoneIds = new Set(
    watches
      .filter(
        (watch) =>
          getWatchTriageState(watch) === "done" &&
          (!watch.doneAt || !isWatchRetentionExpired(watch.doneAt, nowMs)),
      )
      .sort((left, right) => getWatchDoneTimestamp(right) - getWatchDoneTimestamp(left))
      .slice(0, doneWatchRetentionLimit)
      .map((watch) => watch.id),
  );
  const nextWatches = watches.filter((watch) => {
    if (getWatchTriageState(watch) !== "done") {
      return true;
    }

    return retainedDoneIds.has(watch.id);
  });

  return nextWatches.length === watches.length ? watches : nextWatches;
}

export function isWatchRetentionExpired(timestamp: string, now: Date | number): boolean {
  const expiresAt = new Date(timestamp);

  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + watchRetentionMonths);
  const nowMs = typeof now === "number" ? now : now.getTime();
  return expiresAt.getTime() <= nowMs;
}

function getWatchDoneTimestamp(watch: WatchRecord): number {
  const timestamp = watch.doneAt ? Date.parse(watch.doneAt) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
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
  const lastState = getWatchState(watch);

  return {
    ...watch,
    ...(lastState ? { lastState } : {}),
    lastSeenStatus: watch.lastSeenStatus ?? watch.status,
  };
}

export function hasUnseenStatusChange(watch: WatchRecord): boolean {
  return Boolean(watch.lastSeenStatus && watch.status !== watch.lastSeenStatus);
}

export function getWatchState(watch: Pick<WatchRecord, "lastState" | "status">): WatchState | undefined {
  return watch.lastState ?? parseTerminalWatchStatus(watch.status);
}

function parseTerminalWatchStatus(status: string): WatchState | undefined {
  const parts = status.split(":");

  if (parts.length > 2) {
    return undefined;
  }

  if (parts[0] !== "completed") {
    return parts[1] === "failure"
      ? {
          status: parts[0],
          conclusion: null,
          hasFailedChildren: true,
        }
      : undefined;
  }

  return {
    status: "completed",
    conclusion: parts[1] || null,
  };
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
