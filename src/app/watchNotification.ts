import type { WatchState } from "../domain/status";
import type { WatchRecord } from "../domain/watches";
import { createPopupViewModel } from "./viewModel";

export type WatchNotification = {
  title: string;
  body: string;
  largeBody?: string;
  summary?: string;
  group?: string;
  requireInteraction?: boolean;
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
    previousState ? `Was ${formatPreviousStatus(previousState)}` : undefined,
  ].filter(isString);
  const body = lines.join("\n");

  return {
    title: row.label,
    body,
    largeBody: body,
    summary: repoLabel,
    group: repoLabel,
    requireInteraction: true,
  };
}

function formatPreviousStatus(state: WatchState): string {
  if (state.status === "completed") {
    if (state.conclusion === "success") {
      return "Successful";
    }

    if (state.conclusion === "cancelled") {
      return "Cancelled";
    }

    return "Failed";
  }

  if (state.status === "in_progress") {
    return "In progress";
  }

  if (state.status === "queued" || state.status === "pending" || state.status === "requested" || state.status === "waiting") {
    return "Queued";
  }

  return state.status
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}
