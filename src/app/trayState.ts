import type { WatchRecord } from "../domain/watches";
import { getWatchState, getWatchTriageState, hasUnseenStatusChange } from "../domain/watches";

export type TrayStatus = "idle" | "active" | "cancelled" | "error" | "success";

export type TrayState = {
  status: TrayStatus;
  hasUnseenChanges: boolean;
  label: string;
  tooltip: string;
};

export function createTrayState(watches: WatchRecord[]): TrayState {
  const watched = watches.filter((watch) => getWatchTriageState(watch) !== "done");
  const hasUnseenChanges = watched.some(hasUnseenStatusChange);
  const active = watched.filter((watch) => watch.active);
  const errors = watched.filter((watch) => Boolean(watch.error));
  const watchStates = watched.map((watch) => getWatchState(watch));
  const failures = watched.filter(
    (_watch, index) =>
      watchStates[index]?.status === "completed" &&
      watchStates[index].conclusion !== "success" &&
      watchStates[index].conclusion !== "cancelled" &&
      watchStates[index].conclusion !== "skipped",
  );
  const cancelled = watched.filter(
    (_watch, index) => watchStates[index]?.status === "completed" && watchStates[index].conclusion === "cancelled",
  );

  if (errors.length > 0 || failures.length > 0) {
    return {
      status: "error",
      hasUnseenChanges,
      label: `${errors.length + failures.length} watch issue`,
      tooltip: "GHA Watch has failed or errored watches",
    };
  }

  if (active.length > 0) {
    return {
      status: "active",
      hasUnseenChanges,
      label: `${active.length} active watch${active.length === 1 ? "" : "es"}`,
      tooltip: `GHA Watch: ${active.length} active watch${active.length === 1 ? "" : "es"}`,
    };
  }

  if (cancelled.length > 0) {
    return {
      status: "cancelled",
      hasUnseenChanges,
      label: `${cancelled.length} cancelled watch${cancelled.length === 1 ? "" : "es"}`,
      tooltip: "GHA Watch has cancelled watches",
    };
  }

  if (watched.length > 0) {
    return {
      status: "success",
      hasUnseenChanges,
      label: "All watches complete",
      tooltip: "GHA Watch: all watches complete",
    };
  }

  return {
    status: "idle",
    hasUnseenChanges,
    label: "No watches",
    tooltip: "GHA Watch",
  };
}
