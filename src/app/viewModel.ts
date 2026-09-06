import { getRepositoryKey } from "../domain/identity";
import { isDoneCandidate, isDeemphasizedPullRequest, getWatchDisplayLabel, canRerun, canRerunFailed } from "../domain/watchPolicy";
export { canRerun, canRerunFailed, isDeemphasizedPullRequest } from "../domain/watchPolicy";
import type { WatchedRepo } from "../domain/watchedRepos";
import {
  getWatchState,
  getWatchTriageState,
  hasUnseenStatusChange,
  type PrSourceState,
  type WatchRecord,
  type WatchTriageState,
} from "../domain/watches";

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

export type WatchRowViewModel = {
  id: string;
  label: string;
  subject: WatchSubject;
  referenceLabel?: string;
  pullRequestReferenceLabel?: string;
  prState?: PrStateViewModel;
  branchName?: string;
  statusLabel: string;
  description: string;
  tone: RowTone;
  hasFailedChildren: boolean;
  timingText?: string;
  unseenStatusChange: boolean;
  canRerun: boolean;
  canRerunFailed: boolean;
  doneCandidate: boolean;
  deemphasized: boolean;
  triageState: WatchTriageState;
  url: string;
};

export type WatchTreeNodeKind = "pull-request" | "workflow";

export type WatchTreeNodeViewModel = {
  id: string;
  kind: WatchTreeNodeKind;
  label: string;
  referenceLabel?: string;
  detailLabel?: string;
  prState?: PrStateViewModel;
  branchName?: string;
  rowCount: number;
  rowIds: string[];
  primaryRowId?: string;
  statusLabel: string;
  tone: RowTone;
  hasFailedChildren: boolean;
  timingText?: string;
  unseenStatusChange: boolean;
  doneCandidate: boolean;
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
  ciStatus?: RepoCiStatusViewModel;
  watched: boolean;
  rows: WatchRowViewModel[];
  tree: WatchTreeNodeViewModel[];
  items: WatchGroupItemViewModel[];
};

export type RepoCiStatusTone = "success" | "pending" | "failure";

export type RepoCiStatusViewModel = {
  tone: RepoCiStatusTone;
  label: string;
  description: string;
  defaultBranch?: string;
  commitSha?: string;
  workflows: RepoCiWorkflowStatusViewModel[];
  url?: string;
};

export type RepoCiWorkflowStatusViewModel = {
  tone: RepoCiStatusTone;
  label: string;
  description: string;
  name: string;
  url: string;
};

export type PopupViewModel = {
  title: string;
  subtitle: string;
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
  watchedRepos: WatchedRepo[] = [],
  repoOrder: string[] = [],
  repoCiStatuses: Record<string, RepoCiStatusViewModel> = {},
): PopupViewModel {
  const rows = watches.map((watch) =>
    createWatchRowViewModel(watch, now, repoCiStatuses[getRepoLabel(watch.target)]),
  );
  const counts = countRows(rows);

  return {
    title: getTitle(counts, rows.length),
    subtitle: getSubtitle(counts, rows.length),
    groups: orderGroups(groupRowsByRepo(watches, rows, watchedRepos, repoCiStatuses), repoOrder),
    rows,
  };
}

export function createWatchRowViewModel(
  watch: WatchRecord,
  now: Date,
  repoCiStatus?: RepoCiStatusViewModel,
): WatchRowViewModel {
  if (watch.error) {
    return {
      id: watch.id,
      label: getWatchDisplayLabel(watch),
      subject: getWatchSubject(watch),
      referenceLabel: getWatchReference(watch),
      pullRequestReferenceLabel: getRunPullRequestReference(watch),
      prState: getPullRequestState(watch),
      branchName: getBranchName(watch),
      statusLabel: "Errored",
      description: watch.error,
      tone: "error",
      hasFailedChildren: false,
      timingText: getTimingText(watch, "error", now),
      unseenStatusChange: hasUnseenStatusChange(watch),
      canRerun: canRerun(watch),
      canRerunFailed: canRerunFailed(watch),
      doneCandidate: isDoneCandidate(watch, "error", repoCiStatus),
      deemphasized: isDeemphasizedPullRequest(watch),
      triageState: getWatchTriageState(watch),
      url: watch.target.url,
    };
  }

  const state = getWatchState(watch);
  const status = state?.status || watch.status;
  const conclusion = state?.conclusion || null;

  if (status === "completed") {
    if (conclusion === "success") {
      return createRow(watch, "Successful", "This check was successful.", "success", now, repoCiStatus);
    }

    if (conclusion === "cancelled") {
      return createRow(watch, "Cancelled", "This check was cancelled.", "cancelled", now, repoCiStatus);
    }

    if (conclusion === "skipped") {
      return createRow(watch, "Skipped", "This check was skipped.", "skipped", now, repoCiStatus);
    }

    return createRow(watch, "Failed", "This check was not successful.", "failure", now, repoCiStatus);
  }

  if (status === "queued" || status === "pending" || status === "requested" || status === "waiting") {
    return createRow(watch, "Queued", "Waiting to run this check...", "queued", now, repoCiStatus);
  }

  if (status === "in_progress") {
    const hasFailedChildren = Boolean(state?.hasFailedChildren);

    return createRow(
      watch,
      hasFailedChildren ? "Failing" : "In progress",
      hasFailedChildren ? "This check is still running, but at least one job has failed." : "This check has started...",
      "in-progress",
      now,
      repoCiStatus,
    );
  }

  return createRow(watch, titleCase(status), "Waiting for the next status update...", "pending", now, repoCiStatus);
}

function createRow(
  watch: WatchRecord,
  statusLabel: string,
  description: string,
  tone: RowTone,
  now: Date,
  repoCiStatus?: RepoCiStatusViewModel,
): WatchRowViewModel {
  return {
    id: watch.id,
    label: getWatchDisplayLabel(watch),
    subject: getWatchSubject(watch),
    referenceLabel: getWatchReference(watch),
    pullRequestReferenceLabel: getRunPullRequestReference(watch),
    prState: getPullRequestState(watch),
    branchName: getBranchName(watch),
    statusLabel,
    description,
    tone,
    hasFailedChildren: Boolean(getWatchState(watch)?.hasFailedChildren),
    timingText: getTimingText(watch, tone, now),
    unseenStatusChange: hasUnseenStatusChange(watch),
    canRerun: canRerun(watch),
    canRerunFailed: canRerunFailed(watch),
    doneCandidate: isDoneCandidate(watch, tone, repoCiStatus),
    deemphasized: isDeemphasizedPullRequest(watch),
    triageState: getWatchTriageState(watch),
    url: watch.target.url,
  };
}




function getWatchReference(watch: WatchRecord): string | undefined {
  if (watch.target.kind === "run") {
    const runNumber = watch.metadata?.runNumber?.trim();
    return runNumber ? `#${runNumber}` : undefined;
  }

  if (!watch.target.prNumber) {
    return undefined;
  }

  const reference = `#${watch.target.prNumber}`;
  return watch.target.kind === "pr" && getWatchDisplayLabel(watch) === `Pull request ${reference}`
    ? undefined
    : reference;
}

function getRunPullRequestReference(watch: WatchRecord): string | undefined {
  return watch.target.kind === "run" && watch.target.prNumber
    ? `#${watch.target.prNumber}`
    : undefined;
}


function getBranchName(watch: WatchRecord): string | undefined {
  return watch.metadata?.branchName?.trim() || undefined;
}

function getWatchSubject(watch: WatchRecord): WatchSubject {
  if (watch.target.kind === "pr") {
    return "pull-request";
  }

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



function groupRowsByRepo(
  watches: WatchRecord[],
  rows: WatchRowViewModel[],
  watchedRepos: WatchedRepo[],
  repoCiStatuses: Record<string, RepoCiStatusViewModel>,
): WatchGroupViewModel[] {
  const groups: WatchGroupViewModel[] = [];
  const groupByRepo = new Map<string, WatchGroupViewModel>();

  for (const watched of watchedRepos) {
    const repoLabel = getRepoLabel(watched);
    const group = createWatchGroup(watched.owner, watched.repo, watched.repoIconUrl, true, repoCiStatuses[repoLabel]);
    groupByRepo.set(repoLabel, group);
    groups.push(group);
  }

  rows.forEach((row, index) => {
    const watch = watches[index];
    const repoLabel = getRepoLabel(watch.target);
    let group = groupByRepo.get(repoLabel);

    if (!group) {
      group = createWatchGroup(watch.target.owner, watch.target.repo, watch.repoIconUrl, false, repoCiStatuses[repoLabel]);
      groupByRepo.set(repoLabel, group);
      groups.push(group);
    } else if (!group.repoIconUrl && watch.repoIconUrl) {
      group.repoIconUrl = watch.repoIconUrl;
    }

    group.rows.push(row);
    group.items.push({ kind: "row", row });
  });

  return groups;
}

function orderGroups(groups: WatchGroupViewModel[], repoOrder: string[]): WatchGroupViewModel[] {
  if (repoOrder.length === 0) {
    return groups;
  }

  const orderByRepo = new Map(repoOrder.map((repoLabel, index) => [repoLabel.toLowerCase(), index]));

  return groups
    .map((group, index) => ({ group, index, order: orderByRepo.get(group.repoLabel.toLowerCase()) }))
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
  watched: boolean,
  ciStatus?: RepoCiStatusViewModel,
): WatchGroupViewModel {
  return {
    owner,
    repo,
    repoLabel: `${owner}/${repo}`,
    ...(repoIconUrl ? { repoIconUrl } : {}),
    ...(ciStatus ? { ciStatus } : {}),
    watched,
    rows: [],
    tree: [],
    items: [],
  };
}

function getRepoLabel(repo: Pick<WatchedRepo, "owner" | "repo">): string {
  return getRepositoryKey(repo);
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
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
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
