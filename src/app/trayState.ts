import type { WatchRecord } from "../domain/watches";
import { hasUnseenStatusChange } from "../domain/watches";

export type TrayStatus = "idle" | "active" | "cancelled" | "error" | "success";

export type TrayState = {
  status: TrayStatus;
  hasUnseenChanges: boolean;
  label: string;
  tooltip: string;
};

export function createTrayState(watches: WatchRecord[]): TrayState {
  const hasUnseenChanges = watches.some(hasUnseenStatusChange);
  const active = watches.filter((watch) => watch.active);
  const errors = watches.filter((watch) => Boolean(watch.error));
  const failures = watches.filter(
    (watch) =>
      watch.lastState?.status === "completed" &&
      watch.lastState.conclusion !== "success" &&
      watch.lastState.conclusion !== "cancelled" &&
      watch.lastState.conclusion !== "skipped",
  );
  const cancelled = watches.filter(
    (watch) => watch.lastState?.status === "completed" && watch.lastState.conclusion === "cancelled",
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

  if (watches.length > 0) {
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
