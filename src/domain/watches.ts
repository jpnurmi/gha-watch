import type { CheckWatchTarget, PrWatchTarget } from "./githubUrl";
import type { WatchState } from "./status";

export type PrSourceState = "draft" | "ready" | "merged" | "closed";

export type PrWatchResolution = {
  targets: CheckWatchTarget[];
  sourceState: PrSourceState;
};

export type WatchTiming = {
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
};

export type WatchRecord = {
  id: string;
  target: CheckWatchTarget;
  source?: PrWatchTarget;
  sourceState?: PrSourceState;
  label: string;
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
      ...(sourceState ? { sourceState } : {}),
      label: getWatchLabel(target),
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
  if (draggedId === targetId) {
    return watches;
  }

  const draggedWatch = watches.find((watch) => watch.id === draggedId);
  const targetWatch = watches.find((watch) => watch.id === targetId);

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

  const reorderedRepoWatches = moveWatchInList(repoWatches, draggedId, targetId, position);

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

function moveWatchInList(
  watches: WatchRecord[],
  draggedId: string,
  targetId: string,
  position: WatchDropPosition,
): WatchRecord[] {
  const draggedWatch = watches.find((watch) => watch.id === draggedId);
  const targetIndex = watches.findIndex((watch) => watch.id === targetId);

  if (!draggedWatch || targetIndex === -1) {
    return watches;
  }

  const nextWatches = watches.filter((watch) => watch.id !== draggedId);
  const nextTargetIndex = nextWatches.findIndex((watch) => watch.id === targetId);

  if (nextTargetIndex === -1) {
    return watches;
  }

  nextWatches.splice(position === "after" ? nextTargetIndex + 1 : nextTargetIndex, 0, draggedWatch);
  return watchIdsAreEqual(nextWatches, watches) ? watches : nextWatches;
}

function isSameWatchRepo(left: WatchRecord, right: WatchRecord): boolean {
  return left.target.owner === right.target.owner && left.target.repo === right.target.repo;
}

function watchIdsAreEqual(left: WatchRecord[], right: WatchRecord[]): boolean {
  return left.length === right.length && left.every((watch, index) => watch.id === right[index].id);
}
