import type { WatchedRepo } from "./watchedRepos";

export const workflowDiscoveryStateVersion = 2;
export const workflowDiscoveryRecentRunLimit = 1_000;

export type WorkflowDiscoveryCursor = {
  baselineAt?: string;
  lastScannedAt: string;
  recentRunIds: string[];
  subscriptionFingerprint?: string;
  updatedAt: string;
};

export type WorkflowDiscoveryState = {
  version: typeof workflowDiscoveryStateVersion;
  repositories: Record<string, WorkflowDiscoveryCursor>;
};

export const emptyWorkflowDiscoveryState: WorkflowDiscoveryState = {
  version: workflowDiscoveryStateVersion,
  repositories: {},
};

export function getWorkflowDiscoveryRepositoryKey(
  repo: Pick<WatchedRepo, "owner" | "repo">,
): string {
  return `${repo.owner}/${repo.repo}`.toLowerCase();
}

export function getWorkflowDiscoverySubscriptionFingerprint(repo: WatchedRepo): string {
  return buildSubscriptionFingerprint({
    pullRequestScope: repo.pullRequestScope ?? null,
    defaultBranchWorkflowNames: normalizeSubscriptionNames(repo.defaultBranchWorkflowNames),
    userWorkflowNames: normalizeSubscriptionNames(repo.userWorkflowNames),
  });
}

export function normalizeWorkflowDiscoveryState(
  value: unknown,
  now = new Date(),
): WorkflowDiscoveryState {
  if (
    !isRecord(value) ||
    (value.version !== 1 && value.version !== workflowDiscoveryStateVersion) ||
    !isRecord(value.repositories)
  ) {
    return emptyWorkflowDiscoveryState;
  }

  const repositories: Record<string, WorkflowDiscoveryCursor> = {};

  for (const [rawKey, rawCursor] of Object.entries(value.repositories)) {
    const key = normalizeRepositoryKey(rawKey);
    const cursor = normalizeCursor(rawCursor, now);

    if (!key || !cursor) {
      continue;
    }

    const existing = repositories[key];

    if (!existing || Date.parse(cursor.updatedAt) > Date.parse(existing.updatedAt)) {
      repositories[key] = cursor;
    }
  }

  return {
    version: workflowDiscoveryStateVersion,
    repositories,
  };
}

export function pruneWorkflowDiscoveryState(
  state: WorkflowDiscoveryState,
  watchedRepos: Array<Pick<WatchedRepo, "owner" | "repo">>,
): WorkflowDiscoveryState {
  const retainedKeys = new Set(watchedRepos.map(getWorkflowDiscoveryRepositoryKey));
  const repositories = Object.fromEntries(
    Object.entries(state.repositories).filter(([key]) => retainedKeys.has(key)),
  );

  return Object.keys(repositories).length === Object.keys(state.repositories).length
    ? state
    : { ...state, repositories };
}

export function setWorkflowDiscoveryCursor(
  state: WorkflowDiscoveryState,
  repo: WatchedRepo,
  lastScannedAt: Date,
  runIds: string[],
  resetBaseline = false,
): WorkflowDiscoveryState {
  const key = getWorkflowDiscoveryRepositoryKey(repo);
  const previous = state.repositories[key];
  const recentRunIds = normalizeRunIds([
    ...runIds,
    ...(resetBaseline ? [] : previous?.recentRunIds ?? []),
  ]);
  const timestamp = lastScannedAt.toISOString();

  return {
    ...state,
    repositories: {
      ...state.repositories,
      [key]: {
        ...(!resetBaseline && previous?.baselineAt
          ? { baselineAt: previous.baselineAt }
          : { baselineAt: timestamp }),
        lastScannedAt: timestamp,
        recentRunIds,
        subscriptionFingerprint: getWorkflowDiscoverySubscriptionFingerprint(repo),
        updatedAt: timestamp,
      },
    },
  };
}

function normalizeCursor(value: unknown, now: Date): WorkflowDiscoveryCursor | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const lastScannedAt = normalizeTimestamp(value.lastScannedAt, now);
  const baselineAt = normalizeTimestamp(value.baselineAt, now);
  const subscriptionFingerprint = normalizeSubscriptionFingerprint(value.subscriptionFingerprint);

  if (!lastScannedAt) {
    return undefined;
  }

  return {
    ...(baselineAt ? { baselineAt } : {}),
    lastScannedAt,
    recentRunIds: normalizeRunIds(value.recentRunIds),
    ...(subscriptionFingerprint ? { subscriptionFingerprint } : {}),
    updatedAt: normalizeTimestamp(value.updatedAt, now) ?? lastScannedAt,
  };
}

function normalizeSubscriptionNames(value: string[] | undefined): string[] {
  return [...new Set((value ?? []).map((name) => name.trim()).filter(Boolean))]
    .sort();
}

function buildSubscriptionFingerprint(fields: {
  pullRequestScope: NonNullable<WatchedRepo["pullRequestScope"]> | null;
  defaultBranchWorkflowNames: string[];
  userWorkflowNames: string[];
}): string {
  return JSON.stringify({
    pullRequestScope: fields.pullRequestScope,
    defaultBranchWorkflowNames: fields.defaultBranchWorkflowNames,
    userWorkflowNames: fields.userWorkflowNames,
  });
}

function normalizeSubscriptionFingerprint(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);

    if (!isRecord(parsed)) {
      return undefined;
    }

    const pullRequestScope = parsed.pullRequestScope;

    if (pullRequestScope !== null && pullRequestScope !== "all" && pullRequestScope !== "user") {
      return undefined;
    }

    return buildSubscriptionFingerprint({
      pullRequestScope,
      defaultBranchWorkflowNames: normalizeUnknownSubscriptionNames(parsed.defaultBranchWorkflowNames),
      userWorkflowNames: normalizeUnknownSubscriptionNames(parsed.userWorkflowNames),
    });
  } catch {
    return undefined;
  }
}

function normalizeUnknownSubscriptionNames(value: unknown): string[] {
  return normalizeSubscriptionNames(
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [],
  );
}

function normalizeRepositoryKey(value: string): string | undefined {
  const parts = value.trim().split("/");

  if (parts.length !== 2 || parts.some((part) => !part)) {
    return undefined;
  }

  return parts.join("/").toLowerCase();
}

function normalizeTimestamp(value: unknown, now: Date): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return new Date(Math.min(timestamp, now.getTime())).toISOString();
}

function normalizeRunIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const runIds: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string" || !/^[1-9]\d*$/.test(item) || seen.has(item)) {
      continue;
    }

    seen.add(item);
    runIds.push(item);

    if (runIds.length === workflowDiscoveryRecentRunLimit) {
      break;
    }
  }

  return runIds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
