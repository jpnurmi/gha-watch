import type { ParsedWatchTarget } from "./githubUrl";
import type { WatchState } from "./status";

export type WatchRecord = {
  id: string;
  target: ParsedWatchTarget;
  label: string;
  status: string;
  lastState: WatchState | undefined;
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
      lastState: undefined,
      active: true,
      error: undefined,
    },
  ];
}

export function removeWatch(watches: WatchRecord[], id: string): WatchRecord[] {
  return watches.filter((watch) => watch.id !== id);
}
