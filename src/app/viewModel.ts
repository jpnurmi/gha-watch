import type { FavoriteRepo } from "../domain/favorites";
import { getWatchId, hasUnseenStatusChange, type PrSourceState, type WatchRecord } from "../domain/watches";

export type RowTone =
  | "pending"
  | "queued"
  | "in-progress"
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "error";

export type PrStateTone = PrSourceState;

export type PrStateViewModel = {
  label: string;
  tone: PrStateTone;
};

export type WatchSubject = "pull-request" | "workflow" | "job";
export type WatchRemoveMode = "remove" | "ignore-pr-workflow";

export type WatchRowViewModel = {
  id: string;
  label: string;
  subject: WatchSubject;
  prReference?: string;
  prState?: PrStateViewModel;
  statusLabel: string;
  description: string;
  tone: RowTone;
  timingText?: string;
  unseenStatusChange: boolean;
  canRerun: boolean;
  removeMode: WatchRemoveMode;
  url: string;
};

export type HeaderTone = "pending" | "success" | "warning";

export type WatchTreeNodeKind = "pull-request" | "workflow";

export type WatchTreeNodeViewModel = {
  id: string;
  kind: WatchTreeNodeKind;
  label: string;
  referenceLabel?: string;
  detailLabel?: string;
  prState?: PrStateViewModel;
  rowCount: number;
  rowIds: string[];
  primaryRowId?: string;
  statusLabel: string;
  tone: RowTone;
  timingText?: string;
  unseenStatusChange: boolean;
  url?: string;
  rows: WatchRowViewModel[];
  children: WatchTreeNodeViewModel[];
};

export type WatchGroupItemViewModel =
  | {
      kind: "row";
      row: WatchRowViewModel;
    }
  | {
      kind: "tree";
      node: WatchTreeNodeViewModel;
    };

export type WatchGroupViewModel = {
  owner: string;
  repo: string;
  repoLabel: string;
  repoIconUrl?: string;
  favorite: boolean;
  rows: WatchRowViewModel[];
  tree: WatchTreeNodeViewModel[];
  items: WatchGroupItemViewModel[];
};

export type PopupViewModel = {
  title: string;
  subtitle: string;
  headerTone: HeaderTone;
  groups: WatchGroupViewModel[];
  rows: WatchRowViewModel[];
};

type Counts = {
  pending: number;
  queued: number;
  inProgress: number;
  successful: number;
  failed: number;
  cancelled: number;
  skipped: number;
  errored: number;
};

export function createPopupViewModel(
  watches: WatchRecord[],
  now = new Date(),
  favoriteRepos: FavoriteRepo[] = [],
  repoOrder: string[] = [],
): PopupViewModel {
  const rows = watches.map((watch) => createWatchRowViewModel(watch, now));
  const counts = countRows(rows);

  return {
    title: getTitle(counts, rows.length),
    subtitle: getSubtitle(counts, rows.length),
    headerTone: getHeaderTone(counts, rows.length),
    groups: orderGroups(groupRowsByRepo(watches, rows, favoriteRepos), repoOrder),
    rows,
  };
}

function createWatchRowViewModel(watch: WatchRecord, now: Date): WatchRowViewModel {
  if (watch.error) {
    return {
      id: watch.id,
      label: watch.label,
      subject: getWatchSubject(watch),
      prReference: getPullRequestReference(watch),
      prState: getPullRequestState(watch),
      statusLabel: "Errored",
      description: watch.error,
      tone: "error",
      timingText: getTimingText(watch, "error", now),
      unseenStatusChange: hasUnseenStatusChange(watch),
      canRerun: canRerun(watch),
      removeMode: getWatchRemoveMode(watch),
      url: watch.target.url,
    };
  }

  const status = watch.lastState?.status || watch.status;
  const conclusion = watch.lastState?.conclusion || null;

  if (status === "completed") {
    if (conclusion === "success") {
      return createRow(watch, "Successful", "This check was successful.", "success", now);
    }

    if (conclusion === "cancelled") {
      return createRow(watch, "Cancelled", "This check was cancelled.", "cancelled", now);
    }

    if (conclusion === "skipped") {
      return createRow(watch, "Skipped", "This check was skipped.", "skipped", now);
    }

    return createRow(watch, "Failed", "This check was not successful.", "failure", now);
  }

  if (status === "queued" || status === "pending" || status === "requested" || status === "waiting") {
    return createRow(watch, "Queued", "Waiting to run this check...", "queued", now);
  }

  if (status === "in_progress") {
    return createRow(watch, "In progress", "This check has started...", "in-progress", now);
  }

  return createRow(watch, titleCase(status), "Waiting for the next status update...", "pending", now);
}

function createRow(
  watch: WatchRecord,
  statusLabel: string,
  description: string,
  tone: RowTone,
  now: Date,
): WatchRowViewModel {
  return {
    id: watch.id,
    label: watch.label,
    subject: getWatchSubject(watch),
    prReference: getPullRequestReference(watch),
    prState: getPullRequestState(watch),
    statusLabel,
    description,
    tone,
    timingText: getTimingText(watch, tone, now),
    unseenStatusChange: hasUnseenStatusChange(watch),
    canRerun: canRerun(watch),
    removeMode: getWatchRemoveMode(watch),
    url: watch.target.url,
  };
}

function getPullRequestReference(watch: WatchRecord): string | undefined {
  return watch.target.prNumber ? `#${watch.target.prNumber}` : undefined;
}

function getWatchSubject(watch: WatchRecord): WatchSubject {
  return watch.target.kind === "job" ? "job" : "workflow";
}

function getPullRequestState(watch: WatchRecord): PrStateViewModel | undefined {
  if (!watch.sourceState) {
    return undefined;
  }

  return {
    label: getPullRequestStateLabel(watch.sourceState),
    tone: watch.sourceState,
  };
}

function getPullRequestStateLabel(sourceState: PrSourceState): string {
  const labels: Record<PrSourceState, string> = {
    draft: "Draft",
    ready: "Ready",
    merged: "Merged",
    closed: "Closed",
  };

  return labels[sourceState];
}

function canRerun(watch: WatchRecord): boolean {
  return watch.lastState?.status === "completed" &&
    watch.lastState.conclusion !== "success" &&
    watch.lastState.conclusion !== "cancelled" &&
    watch.lastState.conclusion !== "skipped";
}

function getWatchRemoveMode(watch: WatchRecord): WatchRemoveMode {
  return watch.source ? "ignore-pr-workflow" : "remove";
}

function groupRowsByRepo(
  watches: WatchRecord[],
  rows: WatchRowViewModel[],
  favoriteRepos: FavoriteRepo[],
): WatchGroupViewModel[] {
  const groups: WatchGroupViewModel[] = [];
  const groupByRepo = new Map<string, WatchGroupViewModel>();

  for (const favorite of favoriteRepos) {
    const repoLabel = getRepoLabel(favorite);
    const group = createWatchGroup(favorite.owner, favorite.repo, favorite.repoIconUrl, true);
    groupByRepo.set(repoLabel, group);
    groups.push(group);
  }

  rows.forEach((row, index) => {
    const watch = watches[index];
    const repoLabel = getRepoLabel(watch.target);
    let group = groupByRepo.get(repoLabel);

    if (!group) {
      group = createWatchGroup(watch.target.owner, watch.target.repo, watch.repoIconUrl, false);
      groupByRepo.set(repoLabel, group);
      groups.push(group);
    } else if (!group.repoIconUrl && watch.repoIconUrl) {
      group.repoIconUrl = watch.repoIconUrl;
    }

    group.rows.push(row);
    addRowToTree(group, watch, row);
  });

  return groups;
}

function addRowToTree(group: WatchGroupViewModel, watch: WatchRecord, row: WatchRowViewModel): void {
  if (!watch.source && (watch.sourceRun || watch.target.kind === "run")) {
    addDirectWorkflowRowToTree(group, watch, row);
    return;
  }

  const parentNode = getPullRequestTreeNode(group, watch, row);

  if (!parentNode) {
    group.items.push({ kind: "row", row });
    return;
  }

  const workflowLabel = getWorkflowNodeLabel(watch, row);
  const workflowContainer = parentNode.children;
  const workflowId = getWorkflowNodeId(parentNode.id, workflowLabel);
  let workflowNode = workflowContainer.find((node) => node.id === workflowId);

  if (!workflowNode) {
    workflowNode = createTreeNode(workflowId, "workflow", workflowLabel, row.tone, undefined, undefined, row.url);
    workflowContainer.push(workflowNode);
  } else if (!workflowNode.url) {
    workflowNode.url = row.url;
  }

  parentNode.rowCount += 1;
  parentNode.rowIds.push(row.id);
  parentNode.tone = combineTones(parentNode.tone, row.tone);
  parentNode.unseenStatusChange ||= row.unseenStatusChange;
  parentNode.statusLabel = getTreeStatusLabel(parentNode.tone);
  parentNode.detailLabel = getPullRequestNodeDetailLabel(parentNode, row);

  workflowNode.rowCount += 1;
  workflowNode.rowIds.push(row.id);
  if (!workflowNode.primaryRowId) {
    workflowNode.primaryRowId = row.id;
  }
  workflowNode.tone = combineTones(workflowNode.tone, row.tone);
  workflowNode.unseenStatusChange ||= row.unseenStatusChange;
  workflowNode.statusLabel = getTreeStatusLabel(workflowNode.tone);
  workflowNode.detailLabel = getWorkflowNodeDetailLabel(workflowNode);
  workflowNode.rows.push(createTreeRow(watch, row, parentNode, workflowLabel));
}

function addDirectWorkflowRowToTree(group: WatchGroupViewModel, watch: WatchRecord, row: WatchRowViewModel): void {
  const sourceRun = watch.sourceRun ?? (watch.target.kind === "run" ? watch.target : undefined);

  if (!sourceRun) {
    group.items.push({ kind: "row", row });
    return;
  }

  const workflowNode = getDirectWorkflowTreeNode(group, sourceRun, watch, row);

  if (watch.target.kind === "run" && !watch.sourceRun) {
    updateDirectWorkflowParentNode(workflowNode, row);
    return;
  }

  workflowNode.rowCount += 1;
  addUniqueRowId(workflowNode, row.id);
  workflowNode.tone = combineTones(workflowNode.tone, row.tone);
  workflowNode.unseenStatusChange ||= row.unseenStatusChange;
  workflowNode.statusLabel = getTreeStatusLabel(workflowNode.tone);
  workflowNode.detailLabel = getWorkflowNodeDetailLabel(workflowNode);
  workflowNode.rows.push(createDirectWorkflowTreeRow(watch, row, workflowNode));
}

function getDirectWorkflowTreeNode(
  group: WatchGroupViewModel,
  sourceRun: NonNullable<WatchRecord["sourceRun"]>,
  watch: WatchRecord,
  row: WatchRowViewModel,
): WatchTreeNodeViewModel {
  const nodeId = getDirectWorkflowNodeId(sourceRun);
  let node = group.tree.find((item) => item.id === nodeId);

  if (!node) {
    node = createTreeNode(nodeId, "workflow", getDirectWorkflowNodeLabel(watch, row), row.tone, undefined, undefined, sourceRun.url);
    group.tree.push(node);
    group.items.push({ kind: "tree", node });
  }

  return node;
}

function updateDirectWorkflowParentNode(node: WatchTreeNodeViewModel, row: WatchRowViewModel): void {
  node.label = row.label;
  node.primaryRowId = row.id;
  node.url = row.url;
  node.timingText = row.timingText;
  addUniqueRowId(node, row.id);
  node.tone = combineTones(node.tone, row.tone);
  node.unseenStatusChange ||= row.unseenStatusChange;
  node.statusLabel = getTreeStatusLabel(node.tone);
  node.detailLabel = node.rowCount > 0 ? getWorkflowNodeDetailLabel(node) : undefined;
}

function addUniqueRowId(node: WatchTreeNodeViewModel, rowId: string): void {
  if (!node.rowIds.includes(rowId)) {
    node.rowIds.push(rowId);
  }
}

function getPullRequestTreeNode(
  group: WatchGroupViewModel,
  watch: WatchRecord,
  row: WatchRowViewModel,
): WatchTreeNodeViewModel | undefined {
  const parent = getPullRequestNode(watch, row);

  if (!parent) {
    return undefined;
  }

  const parentId = getPullRequestNodeId(group.repoLabel, parent.reference);
  let parentNode = group.tree.find((node) => node.id === parentId);

  if (!parentNode) {
    parentNode = createTreeNode(parentId, "pull-request", parent.label, row.tone, parent.reference, row.prState, parent.url);
    group.tree.push(parentNode);
    group.items.push({ kind: "tree", node: parentNode });
  } else if (shouldUsePullRequestNodeLabel(parentNode.label, parent.label)) {
    parentNode.label = parent.label;
  } else if (!parentNode.prState && row.prState) {
    parentNode.prState = row.prState;
  } else if (!parentNode.url) {
    parentNode.url = parent.url;
  }

  return parentNode;
}

function createTreeNode(
  id: string,
  kind: WatchTreeNodeKind,
  label: string,
  tone: RowTone,
  referenceLabel?: string,
  prState?: PrStateViewModel,
  url?: string,
): WatchTreeNodeViewModel {
  return {
    id,
    kind,
    label,
    ...(referenceLabel ? { referenceLabel } : {}),
    ...(prState ? { prState } : {}),
    rowCount: 0,
    rowIds: [],
    statusLabel: getTreeStatusLabel(tone),
    tone,
    unseenStatusChange: false,
    ...(url ? { url } : {}),
    rows: [],
    children: [],
  };
}

function getPullRequestNode(
  watch: WatchRecord,
  row: WatchRowViewModel,
): { reference: string; label: string; url: string } | undefined {
  if (!watch.source) {
    return undefined;
  }

  const title = getPullRequestTitle(watch, row);

  return {
    reference: `#${watch.source.prNumber}`,
    label: title || "Pull request",
    url: watch.source.url,
  };
}

function getPullRequestTitle(watch: WatchRecord, row: WatchRowViewModel): string | undefined {
  const prTitle = watch.metadata?.prTitle?.trim();

  if (prTitle) {
    return prTitle;
  }

  const metadataTitle = watch.metadata?.runTitle?.trim();

  if (metadataTitle) {
    return metadataTitle;
  }

  if (!watch.source || watch.target.kind !== "run") {
    return undefined;
  }

  const workflowName = watch.metadata?.workflowName?.trim();

  if (workflowName && row.label.startsWith(`${workflowName}: `)) {
    return row.label.slice(workflowName.length + 2).trim() || undefined;
  }

  const separatorIndex = row.label.indexOf(": ");

  if (separatorIndex > 0) {
    return row.label.slice(separatorIndex + 2).trim() || undefined;
  }

  return undefined;
}

function shouldUsePullRequestNodeLabel(currentLabel: string, nextLabel: string): boolean {
  return currentLabel === "Pull request" && nextLabel !== currentLabel;
}

function getPullRequestNodeDetailLabel(node: WatchTreeNodeViewModel, row: WatchRowViewModel): string {
  return [
    row.prState?.label,
    formatCount(node.children.length, "workflow"),
    formatCount(node.rowCount, "check"),
  ]
    .filter((item): item is string => Boolean(item))
    .join(" · ");
}

function getWorkflowNodeDetailLabel(node: WatchTreeNodeViewModel): string {
  return formatCount(node.rowCount, "check");
}

function createTreeRow(
  watch: WatchRecord,
  row: WatchRowViewModel,
  parentNode: WatchTreeNodeViewModel | undefined,
  workflowLabel: string,
): WatchRowViewModel {
  if (!parentNode) {
    return row;
  }

  return {
    ...row,
    label: getNestedWatchRowLabel(watch, row, parentNode, workflowLabel),
    prReference: undefined,
    prState: undefined,
  };
}

function getNestedWatchRowLabel(
  watch: WatchRecord,
  row: WatchRowViewModel,
  parentNode: WatchTreeNodeViewModel,
  workflowLabel: string,
): string {
  if (watch.target.kind === "job") {
    const jobName = watch.metadata?.jobName?.trim();

    if (jobName) {
      return jobName;
    }
  }

  const workflowPrefix = `${workflowLabel}: `;

  if (row.label.startsWith(workflowPrefix)) {
    const label = row.label.slice(workflowPrefix.length).trim();

    if (label && label !== parentNode.label) {
      return label;
    }
  }

  if (watch.target.kind === "run") {
    return `Run #${watch.target.runId}`;
  }

  return row.label;
}

function createDirectWorkflowTreeRow(
  watch: WatchRecord,
  row: WatchRowViewModel,
  workflowNode: WatchTreeNodeViewModel,
): WatchRowViewModel {
  return {
    ...row,
    label: getDirectWorkflowChildLabel(watch, row, workflowNode),
    prReference: undefined,
    prState: undefined,
  };
}

function getDirectWorkflowChildLabel(
  watch: WatchRecord,
  row: WatchRowViewModel,
  workflowNode: WatchTreeNodeViewModel,
): string {
  if (watch.target.kind === "job") {
    const jobName = watch.metadata?.jobName?.trim();

    if (jobName) {
      return jobName;
    }
  }

  const workflowName = watch.metadata?.workflowName?.trim();

  if (workflowName && row.label.startsWith(`${workflowName}: `)) {
    return row.label.slice(workflowName.length + 2).trim() || row.label;
  }

  if (row.label.startsWith(`${workflowNode.label}: `)) {
    return row.label.slice(workflowNode.label.length + 2).trim() || row.label;
  }

  return row.label;
}

function getWorkflowNodeLabel(watch: WatchRecord, row: WatchRowViewModel): string {
  const workflowName = watch.metadata?.workflowName?.trim();

  if (workflowName) {
    return workflowName;
  }

  const separatorIndex = row.label.indexOf(": ");

  if (separatorIndex > 0) {
    return row.label.slice(0, separatorIndex);
  }

  return "GitHub Actions";
}

function getDirectWorkflowNodeLabel(watch: WatchRecord, row: WatchRowViewModel): string {
  if (watch.target.kind === "run") {
    return row.label;
  }

  return watch.metadata?.workflowName?.trim() || getWorkflowNodeLabel(watch, row);
}

function getPullRequestNodeId(repoLabel: string, reference: string): string {
  return `pull-request:${repoLabel}:${reference}`;
}

function getWorkflowNodeId(parentNodeId: string, workflowLabel: string): string {
  return `${parentNodeId}:workflow:${workflowLabel}`;
}

function getDirectWorkflowNodeId(sourceRun: NonNullable<WatchRecord["sourceRun"]>): string {
  return `workflow-run:${getWatchId(sourceRun)}`;
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function combineTones(left: RowTone, right: RowTone): RowTone {
  return getTonePriority(right) < getTonePriority(left) ? right : left;
}

function getTreeStatusLabel(tone: RowTone): string {
  const labels: Record<RowTone, string> = {
    pending: "Pending",
    queued: "Queued",
    "in-progress": "In progress",
    success: "Successful",
    failure: "Failed",
    cancelled: "Cancelled",
    skipped: "Skipped",
    error: "Errored",
  };

  return labels[tone];
}

function getTonePriority(tone: RowTone): number {
  const priorities: Record<RowTone, number> = {
    error: 0,
    failure: 1,
    cancelled: 2,
    "in-progress": 3,
    queued: 4,
    pending: 5,
    success: 6,
    skipped: 7,
  };

  return priorities[tone];
}

function orderGroups(groups: WatchGroupViewModel[], repoOrder: string[]): WatchGroupViewModel[] {
  if (repoOrder.length === 0) {
    return groups;
  }

  const orderByRepo = new Map(repoOrder.map((repoLabel, index) => [repoLabel, index]));

  return groups
    .map((group, index) => ({ group, index, order: orderByRepo.get(group.repoLabel) }))
    .sort((left, right) => {
      if (left.order === undefined && right.order === undefined) {
        return left.index - right.index;
      }

      if (left.order === undefined) {
        return 1;
      }

      if (right.order === undefined) {
        return -1;
      }

      return left.order - right.order;
    })
    .map(({ group }) => group);
}

function createWatchGroup(
  owner: string,
  repo: string,
  repoIconUrl: string | undefined,
  favorite: boolean,
): WatchGroupViewModel {
  return {
    owner,
    repo,
    repoLabel: `${owner}/${repo}`,
    ...(repoIconUrl ? { repoIconUrl } : {}),
    favorite,
    rows: [],
    tree: [],
    items: [],
  };
}

function getRepoLabel(repo: Pick<FavoriteRepo, "owner" | "repo">): string {
  return `${repo.owner}/${repo.repo}`;
}

function getTimingText(watch: WatchRecord, tone: RowTone, now: Date): string | undefined {
  const nowMs = now.getTime();
  const queuedAt = parseTimestamp(watch.timing?.queuedAt);
  const startedAt = parseTimestamp(watch.timing?.startedAt);
  const completedAt = parseTimestamp(watch.timing?.completedAt);

  if (tone === "queued" && queuedAt !== undefined) {
    return `Queued ${formatRelativeTime(queuedAt, nowMs)}`;
  }

  if (tone === "in-progress" && startedAt !== undefined) {
    return `Started ${formatRelativeTime(startedAt, nowMs)} · ${formatDuration(nowMs - startedAt)} elapsed`;
  }

  if (
    (tone === "success" || tone === "failure" || tone === "cancelled" || tone === "skipped") &&
    completedAt !== undefined
  ) {
    const completedText = `Completed ${formatRelativeTime(completedAt, nowMs)}`;

    if (startedAt === undefined) {
      return completedText;
    }

    return `${completedText} · ${formatDuration(completedAt - startedAt)}`;
  }

  return undefined;
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function formatRelativeTime(timestamp: number, now: number): string {
  return `${formatDuration(now - timestamp)} ago`;
}

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));

  if (totalMinutes < 1) {
    return "<1m";
  }

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function countRows(rows: WatchRowViewModel[]): Counts {
  return rows.reduce<Counts>(
    (counts, row) => {
      if (row.tone === "pending") {
        counts.pending += 1;
      } else if (row.tone === "queued") {
        counts.queued += 1;
      } else if (row.tone === "in-progress") {
        counts.inProgress += 1;
      } else if (row.tone === "success") {
        counts.successful += 1;
      } else if (row.tone === "failure") {
        counts.failed += 1;
      } else if (row.tone === "cancelled") {
        counts.cancelled += 1;
      } else if (row.tone === "skipped") {
        counts.skipped += 1;
      } else if (row.tone === "error") {
        counts.errored += 1;
      }

      return counts;
    },
    {
      pending: 0,
      queued: 0,
      inProgress: 0,
      successful: 0,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      errored: 0,
    },
  );
}

function getTitle(counts: Counts, total: number): string {
  if (total === 0) {
    return "Watch GitHub Actions checks";
  }

  if (counts.failed > 0 || counts.errored > 0) {
    return "Some checks were not successful";
  }

  if (counts.cancelled > 0) {
    return "Some checks were cancelled";
  }

  if (counts.pending > 0 || counts.queued > 0 || counts.inProgress > 0) {
    return "Some checks haven't completed yet";
  }

  if (counts.skipped > 0) {
    return "Some checks were skipped";
  }

  return "All checks have passed";
}

function getHeaderTone(counts: Counts, total: number): HeaderTone {
  if (total === 0) {
    return "pending";
  }

  if (
    counts.failed > 0 ||
    counts.cancelled > 0 ||
    counts.skipped > 0 ||
    counts.errored > 0 ||
    counts.pending > 0 ||
    counts.queued > 0 ||
    counts.inProgress > 0
  ) {
    return "warning";
  }

  return "success";
}

function getSubtitle(counts: Counts, total: number): string {
  if (total === 0) {
    return "Add a repository, pull request, workflow run, or job";
  }

  const parts = [
    countLabel(counts.inProgress, "in progress"),
    countLabel(counts.successful, "successful"),
    countLabel(counts.failed, "failed"),
    countLabel(counts.cancelled, "cancelled"),
    countLabel(counts.skipped, "skipped"),
    countLabel(counts.errored, "errored"),
    countLabel(counts.queued + counts.pending, "queued"),
  ].filter(isString);

  return `${joinWithAnd(parts)} ${total === 1 ? "check" : "checks"}`;
}

function countLabel(count: number, label: string): string | undefined {
  return count > 0 ? `${count} ${label}` : undefined;
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

function joinWithAnd(parts: string[]): string {
  if (parts.length === 0) {
    return "0";
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
