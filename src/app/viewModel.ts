import { hasUnseenStatusChange, type PrSourceState, type WatchRecord } from "../domain/watches";

export type RowTone =
  | "pending"
  | "queued"
  | "in-progress"
  | "success"
  | "failure"
  | "cancelled"
  | "error";

export type PrStateTone = PrSourceState;

export type PrStateViewModel = {
  label: string;
  tone: PrStateTone;
};

export type WatchRowViewModel = {
  id: string;
  label: string;
  prReference?: string;
  prState?: PrStateViewModel;
  statusLabel: string;
  description: string;
  tone: RowTone;
  timingText?: string;
  unseenStatusChange: boolean;
  canRerun: boolean;
  url: string;
};

export type HeaderTone = "pending" | "success" | "warning";

export type WatchGroupViewModel = {
  repoLabel: string;
  repoIconUrl?: string;
  rows: WatchRowViewModel[];
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
  errored: number;
};

export function createPopupViewModel(watches: WatchRecord[], now = new Date()): PopupViewModel {
  const rows = watches.map((watch) => createWatchRowViewModel(watch, now));
  const counts = countRows(rows);

  return {
    title: getTitle(counts, rows.length),
    subtitle: getSubtitle(counts, rows.length),
    headerTone: getHeaderTone(counts, rows.length),
    groups: groupRowsByRepo(watches, rows),
    rows,
  };
}

function createWatchRowViewModel(watch: WatchRecord, now: Date): WatchRowViewModel {
  if (watch.error) {
    return {
      id: watch.id,
      label: watch.label,
      prReference: getPullRequestReference(watch),
      prState: getPullRequestState(watch),
      statusLabel: "Errored",
      description: watch.error,
      tone: "error",
      timingText: getTimingText(watch, "error", now),
      unseenStatusChange: hasUnseenStatusChange(watch),
      canRerun: canRerun(watch),
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
    prReference: getPullRequestReference(watch),
    prState: getPullRequestState(watch),
    statusLabel,
    description,
    tone,
    timingText: getTimingText(watch, tone, now),
    unseenStatusChange: hasUnseenStatusChange(watch),
    canRerun: canRerun(watch),
    url: watch.target.url,
  };
}

function getPullRequestReference(watch: WatchRecord): string | undefined {
  return watch.target.prNumber ? `#${watch.target.prNumber}` : undefined;
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
    watch.lastState.conclusion !== "cancelled";
}

function groupRowsByRepo(watches: WatchRecord[], rows: WatchRowViewModel[]): WatchGroupViewModel[] {
  const groups: WatchGroupViewModel[] = [];
  const groupByRepo = new Map<string, WatchGroupViewModel>();

  rows.forEach((row, index) => {
    const repoLabel = getRepoLabel(watches[index]);
    let group = groupByRepo.get(repoLabel);

    if (!group) {
      group = { repoLabel, repoIconUrl: watches[index].repoIconUrl, rows: [] };
      groupByRepo.set(repoLabel, group);
      groups.push(group);
    } else if (!group.repoIconUrl && watches[index].repoIconUrl) {
      group.repoIconUrl = watches[index].repoIconUrl;
    }

    group.rows.push(row);
  });

  return groups;
}

function getRepoLabel(watch: WatchRecord): string {
  return `${watch.target.owner}/${watch.target.repo}`;
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
    (tone === "success" || tone === "failure" || tone === "cancelled") &&
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

  return "All checks have passed";
}

function getHeaderTone(counts: Counts, total: number): HeaderTone {
  if (total === 0) {
    return "pending";
  }

  if (
    counts.failed > 0 ||
    counts.cancelled > 0 ||
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
    return "Paste a workflow run or job link to start watching";
  }

  const parts = [
    countLabel(counts.inProgress, "in progress"),
    countLabel(counts.successful, "successful"),
    countLabel(counts.failed, "failed"),
    countLabel(counts.cancelled, "cancelled"),
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
