import type { PrWatchTarget, RunWatchTarget } from "../domain/githubUrl";
import { getWatchId, type WatchRecord } from "../domain/watches";
import { createPopupViewModel } from "./viewModel";

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
  const row = createPopupViewModel([watch], now).rows[0];
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

export function createPullRequestNotification(
  source: PrWatchTarget,
  sourceWatches: WatchRecord[],
  now = new Date(),
): WatchNotification | undefined {
  const repoLabel = `${source.owner}/${source.repo}`;
  const summary = `${repoLabel} #${source.prNumber}`;
  const node = getPullRequestNotificationNode(source, sourceWatches, now);

  if (!node) {
    return undefined;
  }

  const statusLine = [node.statusLabel, node.detailLabel].filter(isString).join(" - ");
  const body = [summary, statusLine, node.timingText].filter(isString).join("\n");
  const persistent = isPersistentNotification(node.tone);

  return {
    watchId: getPullRequestNotificationId(source),
    title: getPullRequestNotificationTitle(source, node.label),
    url: source.url,
    body,
    largeBody: body,
    persistent,
    ...(!persistent ? { timeoutMs: transientNotificationTimeoutMs } : {}),
    summary,
    group: summary,
    actions: getNotificationActions(
      node.tone === "failure" || node.hasFailedChildren,
      node.doneCandidate,
    ),
  };
}

export function createWorkflowNotification(
  source: RunWatchTarget,
  sourceWatches: WatchRecord[],
  now = new Date(),
): WatchNotification | undefined {
  const repoLabel = `${source.owner}/${source.repo}`;
  const node = getWorkflowNotificationNode(source, sourceWatches, now);

  if (!node) {
    return undefined;
  }

  const statusLine = [node.statusLabel, node.detailLabel].filter(isString).join(" - ");
  const body = [repoLabel, statusLine, node.timingText].filter(isString).join("\n");
  const persistent = isPersistentNotification(node.tone);

  return {
    watchId: getWatchId(source),
    title: node.label,
    url: source.url,
    body,
    largeBody: body,
    persistent,
    ...(!persistent ? { timeoutMs: transientNotificationTimeoutMs } : {}),
    summary: repoLabel,
    group: repoLabel,
    actions: getNotificationActions(
      node.tone === "failure" || node.hasFailedChildren,
      node.doneCandidate,
    ),
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

export function getPullRequestNotificationStatus(
  source: PrWatchTarget,
  sourceWatches: WatchRecord[],
  now = new Date(),
): string | undefined {
  return getPullRequestNotificationNode(source, sourceWatches, now)?.tone;
}

export function getWorkflowNotificationStatus(
  source: RunWatchTarget,
  sourceWatches: WatchRecord[],
  now = new Date(),
): string | undefined {
  return getWorkflowNotificationNode(source, sourceWatches, now)?.tone;
}

export function getPullRequestNotificationId(source: PrWatchTarget): string {
  return `${source.owner}/${source.repo}/pull/${source.prNumber}`;
}

function getPullRequestNotificationNode(
  source: PrWatchTarget,
  sourceWatches: WatchRecord[],
  now: Date,
) {
  const repoLabel = `${source.owner}/${source.repo}`;

  return createPopupViewModel(sourceWatches, now)
    .groups.find((group) => group.repoLabel === repoLabel)
    ?.tree.find((item) => item.kind === "pull-request" && item.referenceLabel === `#${source.prNumber}`);
}

function getWorkflowNotificationNode(
  source: RunWatchTarget,
  sourceWatches: WatchRecord[],
  now: Date,
) {
  const repoLabel = `${source.owner}/${source.repo}`;
  const nodeId = `workflow-run:${getWatchId(source)}`;

  return createPopupViewModel(sourceWatches, now)
    .groups.find((group) => group.repoLabel === repoLabel)
    ?.tree.find((item) => item.kind === "workflow" && item.id === nodeId);
}

function getNotificationRepoLabel(watch: WatchRecord): string {
  const repoLabel = `${watch.target.owner}/${watch.target.repo}`;
  return watch.target.prNumber ? `${repoLabel} #${watch.target.prNumber}` : repoLabel;
}

function getPullRequestNotificationTitle(source: PrWatchTarget, label: string): string {
  const reference = `#${source.prNumber}`;
  return label && label !== "Pull request" ? `${reference}: ${label}` : reference;
}

function isPersistentNotification(tone: string): boolean {
  return tone === "failure";
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}
