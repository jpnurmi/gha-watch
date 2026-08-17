import type { WatchRecord } from "../domain/watches";
import { getWatchState, getWatchTriageState, hasUnseenStatusChange } from "../domain/watches";
import { isDeemphasizedPullRequest } from "./viewModel";

export type TrayStatus = "idle" | "active" | "mixed" | "cancelled" | "error" | "success";

export type TrayState = {
  status: TrayStatus;
  hasUnseenChanges: boolean;
  label: string;
  tooltip: string;
};

export function createTrayState(watches: WatchRecord[]): TrayState {
  const inbox = watches.filter(
    (watch) => getWatchTriageState(watch) === "inbox" && !isDeemphasizedPullRequest(watch),
  );
  const hasUnseenChanges = inbox.some(hasUnseenStatusChange);
  const active = inbox.filter((watch) => watch.active);
  const errors = inbox.filter((watch) => Boolean(watch.error));
  const watchStates = inbox.map((watch) => getWatchState(watch));
  const failures = inbox.filter(
    (_watch, index) =>
      watchStates[index]?.status === "completed" &&
      watchStates[index].conclusion !== "success" &&
      watchStates[index].conclusion !== "cancelled" &&
      watchStates[index].conclusion !== "skipped",
  );
  const cancelled = inbox.filter(
    (_watch, index) => watchStates[index]?.status === "completed" && watchStates[index].conclusion === "cancelled",
  );
  const hasActiveFailures = inbox.some(
    (watch, index) => watch.active && Boolean(watchStates[index]?.hasFailedChildren),
  );

  if (hasActiveFailures || (active.length > 0 && (errors.length > 0 || failures.length > 0))) {
    return {
      status: "mixed",
      hasUnseenChanges,
      label: `Failures with ${active.length} active watch${active.length === 1 ? "" : "es"}`,
      tooltip: `GHA Watch: failures detected; ${active.length} watch${active.length === 1 ? "" : "es"} still active`,
    };
  }

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

  if (inbox.length > 0) {
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
