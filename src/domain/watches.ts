import type { ParsedWatchTarget } from "./githubUrl";
import type { WatchState } from "./status";

export type WatchTiming = {
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
};

export type WatchRecord = {
  id: string;
  target: ParsedWatchTarget;
  label: string;
  repoIconUrl?: string;
  status: string;
  lastSeenStatus?: string;
  lastState: WatchState | undefined;
  timing?: WatchTiming;
  active: boolean;
  error: string | undefined;
};

export function getWatchId(target: ParsedWatchTarget): string {
  if (target.kind === "run") {
    return `${target.owner}/${target.repo}/run/${target.runId}`;
  }

  return `${target.owner}/${target.repo}/job/${target.jobId}`;
}

export function getWatchLabel(target: ParsedWatchTarget): string {
  if (target.kind === "run") {
    return `${target.owner}/${target.repo}#${target.runId}`;
  }

  return `${target.owner}/${target.repo} job #${target.jobId}`;
}

export function addWatch(watches: WatchRecord[], target: ParsedWatchTarget): WatchRecord[] {
  const id = getWatchId(target);

  if (watches.some((watch) => watch.id === id)) {
    return watches;
  }

  return [
    ...watches,
    {
      id,
      target,
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
