import type { WatchState } from "../domain/status";
import type { WatchRecord } from "../domain/watches";
import { createPopupViewModel } from "./viewModel";

export type WatchNotification = {
  watchId: string;
  title: string;
  url: string;
  body: string;
  largeBody?: string;
  summary?: string;
  group?: string;
};

export function createWatchNotification(
  watch: WatchRecord,
  previousState: WatchState | undefined,
  now = new Date(),
): WatchNotification {
  const row = createPopupViewModel([watch], now).rows[0];
  const repoLabel = `${watch.target.owner}/${watch.target.repo}`;
  const lines = [
    repoLabel,
    `${row.statusLabel} - ${row.description}`,
    row.timingText,
    previousState ? `Previously ${formatPreviousStatus(previousState)}` : undefined,
  ].filter(isString);
  const body = lines.join("\n");

  return {
    watchId: watch.id,
    title: row.label,
    url: watch.target.url,
    body,
    largeBody: body,
    summary: repoLabel,
    group: repoLabel,
  };
}

function formatPreviousStatus(state: WatchState): string {
  if (state.status === "completed") {
    if (state.conclusion === "success") {
      return "successful";
    }

    if (state.conclusion === "cancelled") {
      return "cancelled";
    }

    return "failed";
  }

  if (state.status === "in_progress") {
    return "in progress";
  }

  if (state.status === "queued" || state.status === "pending" || state.status === "requested" || state.status === "waiting") {
    return "queued";
  }

  return state.status
    .split("_")
    .join(" ");
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}
