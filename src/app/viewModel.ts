import { hasUnseenStatusChange, type WatchRecord } from "../domain/watches";

export type RowTone =
  | "pending"
  | "queued"
  | "in-progress"
  | "success"
  | "failure"
  | "cancelled"
  | "error";

export type WatchRowViewModel = {
  id: string;
  label: string;
  statusLabel: string;
  description: string;
  tone: RowTone;
  unseenStatusChange: boolean;
  url: string;
};

export type HeaderTone = "pending" | "success" | "warning";

export type WatchGroupViewModel = {
  repoLabel: string;
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

export function createPopupViewModel(watches: WatchRecord[]): PopupViewModel {
  const rows = watches.map(createWatchRowViewModel);
  const counts = countRows(rows);

  return {
    title: getTitle(counts, rows.length),
    subtitle: getSubtitle(counts, rows.length),
    headerTone: getHeaderTone(counts, rows.length),
    groups: groupRowsByRepo(watches, rows),
    rows,
  };
}

function createWatchRowViewModel(watch: WatchRecord): WatchRowViewModel {
  if (watch.error) {
    return {
      id: watch.id,
      label: watch.label,
      statusLabel: "Errored",
      description: watch.error,
      tone: "error",
      unseenStatusChange: hasUnseenStatusChange(watch),
      url: watch.target.url,
    };
  }

  const status = watch.lastState?.status || watch.status;
  const conclusion = watch.lastState?.conclusion || null;

  if (status === "completed") {
    if (conclusion === "success") {
      return createRow(watch, "Successful", "This check was successful.", "success");
    }

    if (conclusion === "cancelled") {
      return createRow(watch, "Cancelled", "This check was cancelled.", "cancelled");
    }

    return createRow(watch, "Failed", "This check was not successful.", "failure");
  }

  if (status === "queued" || status === "pending" || status === "requested" || status === "waiting") {
    return createRow(watch, "Queued", "Waiting to run this check...", "queued");
  }

  if (status === "in_progress") {
    return createRow(watch, "In progress", "This check has started...", "in-progress");
  }

  return createRow(watch, titleCase(status), "Waiting for the next status update...", "pending");
}

function createRow(
  watch: WatchRecord,
  statusLabel: string,
  description: string,
  tone: RowTone,
): WatchRowViewModel {
  return {
    id: watch.id,
    label: watch.label,
    statusLabel,
    description,
    tone,
    unseenStatusChange: hasUnseenStatusChange(watch),
    url: watch.target.url,
  };
}

function groupRowsByRepo(watches: WatchRecord[], rows: WatchRowViewModel[]): WatchGroupViewModel[] {
  const groups: WatchGroupViewModel[] = [];
  const groupByRepo = new Map<string, WatchGroupViewModel>();

  rows.forEach((row, index) => {
    const repoLabel = getRepoLabel(watches[index]);
    let group = groupByRepo.get(repoLabel);

    if (!group) {
      group = { repoLabel, rows: [] };
      groupByRepo.set(repoLabel, group);
      groups.push(group);
    }

    group.rows.push(row);
  });

  return groups;
}

function getRepoLabel(watch: WatchRecord): string {
  return `${watch.target.owner}/${watch.target.repo}`;
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
