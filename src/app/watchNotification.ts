import { type WatchRecord } from "../domain/watches";
import { createWatchRowViewModel } from "./viewModel";

export type DesktopNotificationActionId =
  | "open"
  | "rerun-all"
  | "rerun-failed"
  | "save"
  | "done";

export type WatchNotificationAction = {
  id: DesktopNotificationActionId;
  label: string;
};

export type WatchNotification = {
  watchId: string;
  title: string;
  url: string;
  body: string;
  largeBody?: string;
  persistent: boolean;
  timeoutMs?: number;
  summary?: string;
  group?: string;
  actions: WatchNotificationAction[];
};

const transientNotificationTimeoutMs = 15_000;

export function createWatchNotification(
  watch: WatchRecord,
  now = new Date(),
): WatchNotification {
  const row = createWatchRowViewModel(watch, now);
  const repoLabel = getNotificationRepoLabel(watch);
  const lines = [
    repoLabel,
    `${row.statusLabel} - ${row.description}`,
    row.timingText,
  ].filter(isString);
  const body = lines.join("\n");
  const persistent = isPersistentNotification(row.tone);

  return {
    watchId: watch.id,
    title: row.label,
    url: watch.target.url,
    body,
    largeBody: body,
    persistent,
    ...(!persistent ? { timeoutMs: transientNotificationTimeoutMs } : {}),
    summary: repoLabel,
    group: repoLabel,
    actions: getNotificationActions(row.canRerunFailed, row.doneCandidate),
  };
}

function getNotificationActions(
  canRerunFailed: boolean,
  doneCandidate: boolean,
): WatchNotificationAction[] {
  return [
    ...(canRerunFailed
      ? [
          { id: "rerun-all" as const, label: "Re-run all" },
          { id: "rerun-failed" as const, label: "Re-run failed" },
        ]
      : doneCandidate
        ? [{ id: "done" as const, label: "Done" }]
        : []),
    { id: "open", label: "Open" },
  ];
}

function getNotificationRepoLabel(watch: WatchRecord): string {
  const repoLabel = `${watch.target.owner}/${watch.target.repo}`;
  return watch.target.prNumber ? `${repoLabel} #${watch.target.prNumber}` : repoLabel;
}

function isPersistentNotification(tone: string): boolean {
  return tone === "failure";
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}
