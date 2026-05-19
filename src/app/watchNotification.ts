import type { PrWatchTarget, RunWatchTarget } from "../domain/githubUrl";
import type { WatchState } from "../domain/status";
import { getWatchId, type WatchRecord } from "../domain/watches";
import { createPopupViewModel } from "./viewModel";

export type WatchNotification = {
  watchId: string;
  title: string;
  url: string;
  body: string;
  largeBody?: string;
  persistent: boolean;
  summary?: string;
  group?: string;
};

export function createWatchNotification(
  watch: WatchRecord,
  previousState: WatchState | undefined,
  now = new Date(),
): WatchNotification {
  const row = createPopupViewModel([watch], now).rows[0];
  const repoLabel = getNotificationRepoLabel(watch);
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
    persistent: isPersistentNotification(row.tone),
    summary: repoLabel,
    group: repoLabel,
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

  return {
    watchId: getPullRequestNotificationId(source),
    title: getPullRequestNotificationTitle(source, node.label),
    url: source.url,
    body,
    largeBody: body,
    persistent: isPersistentNotification(node.tone),
    summary,
    group: summary,
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

  return {
    watchId: getWatchId(source),
    title: node.label,
    url: source.url,
    body,
    largeBody: body,
    persistent: isPersistentNotification(node.tone),
    summary: repoLabel,
    group: repoLabel,
  };
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
  return (
    tone === "success" ||
    tone === "failure" ||
    tone === "cancelled" ||
    tone === "skipped" ||
    tone === "error"
  );
}

function formatPreviousStatus(state: WatchState): string {
  if (state.status === "completed") {
    if (state.conclusion === "success") {
      return "successful";
    }

    if (state.conclusion === "cancelled") {
      return "cancelled";
    }

    if (state.conclusion === "skipped") {
      return "skipped";
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
