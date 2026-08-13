import {
  getWatchState,
  hasUnseenStatusChange,
  type WatchRecord,
  type WatchTriageState,
} from "../domain/watches";
import type { WatchRowViewModel } from "./viewModel";

export const watchFilterStatuses = [
  "running",
  "failing",
  "successful",
  "cancelled",
  "errored",
  "unseen",
] as const;

export type WatchFilterStatus = (typeof watchFilterStatuses)[number];

export type WatchFilters = {
  query: string;
  repository?: string;
  statuses: WatchFilterStatus[];
};

export type WatchFilterCandidate = {
  row: WatchRowViewModel;
  watch: WatchRecord;
};

export type WatchFilterKeyboardAction =
  | "clear-query"
  | "close-filters"
  | "dismiss-popup"
  | "focus-search"
  | "none";

export function createEmptyWatchFilters(): WatchFilters {
  return { query: "", statuses: [] };
}

export function createWatchFiltersByView(): Record<WatchTriageState, WatchFilters> {
  return {
    inbox: createEmptyWatchFilters(),
    saved: createEmptyWatchFilters(),
    done: createEmptyWatchFilters(),
  };
}

export function normalizeWatchFilters(filters: WatchFilters): WatchFilters {
  const statuses = watchFilterStatuses.filter((status) => filters.statuses.includes(status));
  const repository = filters.repository?.trim().toLowerCase();

  return {
    query: filters.query.trim().toLowerCase(),
    ...(repository ? { repository } : {}),
    statuses,
  };
}

export function hasActiveWatchFilters(filters: WatchFilters): boolean {
  const normalized = normalizeWatchFilters(filters);
  return Boolean(normalized.query || normalized.repository || normalized.statuses.length > 0);
}

export function filterWatchCandidates(
  candidates: WatchFilterCandidate[],
  filters: WatchFilters,
): WatchFilterCandidate[] {
  const normalized = normalizeWatchFilters(filters);

  if (!hasActiveWatchFilters(normalized)) {
    return candidates;
  }

  return candidates.filter((candidate) => matchesWatchFilters(candidate, normalized));
}

export function matchesWatchFilters(
  candidate: WatchFilterCandidate,
  filters: WatchFilters,
): boolean {
  const normalized = normalizeWatchFilters(filters);
  const repoLabel = getWatchRepository(candidate.watch).toLowerCase();

  if (normalized.repository && repoLabel !== normalized.repository) {
    return false;
  }

  if (
    normalized.statuses.length > 0 &&
    !normalized.statuses.some((status) => matchesWatchStatus(candidate.watch, status))
  ) {
    return false;
  }

  return !normalized.query || getSearchableWatchText(candidate).includes(normalized.query);
}

export function getWatchRepositories(watches: WatchRecord[]): string[] {
  const repositories = new Set<string>();

  for (const watch of watches) {
    repositories.add(getWatchRepository(watch));
  }

  return [...repositories].sort((left, right) => left.localeCompare(right));
}

export function toggleWatchFilterStatus(
  filters: WatchFilters,
  status: WatchFilterStatus,
): WatchFilters {
  if (filters.statuses.includes(status)) {
    return {
      ...filters,
      statuses: filters.statuses.filter((item) => item !== status),
    };
  }

  return {
    ...filters,
    statuses: watchFilterStatuses.filter(
      (item) => item === status || filters.statuses.includes(item),
    ),
  };
}

export function parseWatchFilterStatus(value: string | undefined): WatchFilterStatus | undefined {
  return watchFilterStatuses.find((status) => status === value);
}

export function getWatchFilterKeyboardAction(options: {
  filters: WatchFilters;
  filtersFocused: boolean;
  key: string;
  textControlActive: boolean;
}): WatchFilterKeyboardAction {
  if (options.key === "/") {
    return options.textControlActive ? "none" : "focus-search";
  }

  if (options.key !== "Escape") {
    return "none";
  }

  if (options.filters.query) {
    return "clear-query";
  }

  if (options.filtersFocused || hasActiveWatchFilters(options.filters)) {
    return "close-filters";
  }

  return "dismiss-popup";
}

function getSearchableWatchText({ row, watch }: WatchFilterCandidate): string {
  const repository = getWatchRepository(watch);
  const prNumber = watch.target.prNumber ?? watch.source?.prNumber;

  return [
    repository,
    watch.target.owner,
    watch.target.repo,
    watch.id,
    watch.label,
    watch.status,
    watch.target.kind === "pr" ? undefined : watch.target.runId,
    watch.target.kind === "job" ? watch.target.jobId : undefined,
    prNumber,
    prNumber ? `#${prNumber}` : undefined,
    watch.metadata?.prTitle,
    watch.metadata?.workflowName,
    watch.metadata?.runTitle,
    watch.metadata?.jobName,
    watch.metadata?.branchName,
    row.label,
    row.prReference,
    row.statusLabel,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();
}

function matchesWatchStatus(watch: WatchRecord, status: WatchFilterStatus): boolean {
  if (status === "unseen") {
    return hasUnseenStatusChange(watch);
  }

  if (status === "errored") {
    return Boolean(watch.error);
  }

  if (watch.error) {
    return false;
  }

  const state = getWatchState(watch);

  if (!state) {
    return status === "running" && isRunningStatus(watch.status);
  }

  if (status === "running") {
    return isRunningStatus(state.status);
  }

  if (status === "failing") {
    return Boolean(
      (state.status === "in_progress" && state.hasFailedChildren) ||
        (state.status === "completed" &&
          state.conclusion &&
          state.conclusion !== "success" &&
          state.conclusion !== "cancelled" &&
          state.conclusion !== "skipped"),
    );
  }

  if (status === "successful") {
    return state.status === "completed" && state.conclusion === "success";
  }

  return status === "cancelled" &&
    state.status === "completed" &&
    state.conclusion === "cancelled";
}

function isRunningStatus(status: string): boolean {
  return status === "pending" ||
    status === "queued" ||
    status === "requested" ||
    status === "waiting" ||
    status === "in_progress";
}

function getWatchRepository(watch: WatchRecord): string {
  return `${watch.target.owner}/${watch.target.repo}`;
}
