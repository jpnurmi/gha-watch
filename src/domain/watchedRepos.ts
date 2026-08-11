export type WatchedRepo = {
  owner: string;
  repo: string;
  repoIconUrl?: string;
  pullRequestScope?: WatchedPullRequestScope;
  defaultBranchWorkflowNames?: string[];
  userWorkflowNames?: string[];
};

export type WatchedPullRequestScope = "all" | "user";
export type WatchedWorkflowSubscriptionScope = "defaultBranch" | "user";

const ownerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const repoPattern = /^[A-Za-z0-9._-]+$/;

export function normalizeWatchedRepos(value: unknown): WatchedRepo[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const watchedRepos: WatchedRepo[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const watchedRepo = normalizeWatchedRepo(item);

    if (!watchedRepo) {
      continue;
    }

    const key = getWatchedRepoKey(watchedRepo);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    watchedRepos.push(watchedRepo);
  }

  return watchedRepos;
}

export function addWatchedRepo(watchedRepos: WatchedRepo[], repo: Pick<WatchedRepo, "owner" | "repo">): WatchedRepo[] {
  const watchedRepo = watchedRepos.find((item) => getWatchedRepoKey(item) === getWatchedRepoKey(repo));

  if (watchedRepo?.pullRequestScope === "user") {
    return watchedRepos;
  }

  if (watchedRepo) {
    return watchedRepos.map((item) => item === watchedRepo ? { ...item, pullRequestScope: "user" } : item);
  }

  return [...watchedRepos, { owner: repo.owner, repo: repo.repo, pullRequestScope: "user" }];
}

export function toggleWatchedPullRequestScope(
  watchedRepos: WatchedRepo[],
  repo: Pick<WatchedRepo, "owner" | "repo">,
  scope: WatchedPullRequestScope,
): WatchedRepo[] {
  const key = getWatchedRepoKey(repo);
  const watchedRepo = watchedRepos.find((item) => getWatchedRepoKey(item) === key);

  if (!watchedRepo) {
    return [...watchedRepos, { owner: repo.owner, repo: repo.repo, pullRequestScope: scope }];
  }

  if (watchedRepo.pullRequestScope !== scope) {
    return watchedRepos.map((item) => item === watchedRepo ? { ...item, pullRequestScope: scope } : item);
  }

  const nextWatchedRepo = { ...watchedRepo };
  delete nextWatchedRepo.pullRequestScope;

  return hasWatchedRepoSubscriptions(nextWatchedRepo)
    ? watchedRepos.map((item) => item === watchedRepo ? nextWatchedRepo : item)
    : watchedRepos.filter((item) => item !== watchedRepo);
}

export function isWatchedRepo(watchedRepos: WatchedRepo[], repo: Pick<WatchedRepo, "owner" | "repo">): boolean {
  const key = getWatchedRepoKey(repo);
  return watchedRepos.some((watchedRepo) => getWatchedRepoKey(watchedRepo) === key);
}

export function updateWatchedRepoIcon(
  watchedRepos: WatchedRepo[],
  repo: Pick<WatchedRepo, "owner" | "repo">,
  repoIconUrl: string | undefined,
): WatchedRepo[] {
  if (!repoIconUrl) {
    return watchedRepos;
  }

  const key = getWatchedRepoKey(repo);

  return watchedRepos.map((watchedRepo) =>
    getWatchedRepoKey(watchedRepo) === key ? { ...watchedRepo, repoIconUrl } : watchedRepo,
  );
}

export function toggleWatchedWorkflowSubscription(
  watchedRepos: WatchedRepo[],
  repo: Pick<WatchedRepo, "owner" | "repo">,
  scope: WatchedWorkflowSubscriptionScope,
  workflowName: string,
): WatchedRepo[] {
  const cleanWorkflowName = normalizeWorkflowName(workflowName);

  if (!cleanWorkflowName) {
    return watchedRepos;
  }

  const watchedRepo = watchedRepos.find((item) => getWatchedRepoKey(item) === getWatchedRepoKey(repo));
  const nextWatchedRepo = toggleWatchedWorkflowName(
    watchedRepo ?? { owner: repo.owner, repo: repo.repo },
    scope,
    cleanWorkflowName,
  );

  if (!watchedRepo) {
    return [...watchedRepos, nextWatchedRepo];
  }

  if (!hasWatchedRepoSubscriptions(nextWatchedRepo)) {
    return watchedRepos.filter((item) => item !== watchedRepo);
  }

  return watchedRepos.map((item) => (item === watchedRepo ? nextWatchedRepo : item));
}

export function hasWatchedWorkflowSubscriptions(repo: WatchedRepo): boolean {
  return Boolean(repo.defaultBranchWorkflowNames?.length || repo.userWorkflowNames?.length);
}

export function getWatchedPullRequestScope(repo: WatchedRepo): WatchedPullRequestScope | undefined {
  return repo.pullRequestScope;
}

export function getWatchedRepoKey(repo: Pick<WatchedRepo, "owner" | "repo">): string {
  return `${repo.owner}/${repo.repo}`;
}

function normalizeWatchedRepo(value: unknown): WatchedRepo | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const owner = normalizeGitHubOwner(record.owner);
  const repo = normalizeGitHubRepo(record.repo);

  if (!owner || !repo) {
    return undefined;
  }

  const repoIconUrl = typeof record.repoIconUrl === "string" && record.repoIconUrl.length > 0
    ? record.repoIconUrl
    : undefined;
  const defaultBranchWorkflowNames = normalizeWorkflowNames(record.defaultBranchWorkflowNames);
  const userWorkflowNames = normalizeWorkflowNames(record.userWorkflowNames);
  const pullRequestScope = normalizePullRequestScope(record.pullRequestScope);

  if (!pullRequestScope && defaultBranchWorkflowNames.length === 0 && userWorkflowNames.length === 0) {
    return undefined;
  }

  return {
    owner,
    repo,
    ...(repoIconUrl ? { repoIconUrl } : {}),
    ...(pullRequestScope ? { pullRequestScope } : {}),
    ...(defaultBranchWorkflowNames.length ? { defaultBranchWorkflowNames } : {}),
    ...(userWorkflowNames.length ? { userWorkflowNames } : {}),
  };
}

function normalizeGitHubOwner(value: unknown): string | undefined {
  const owner = typeof value === "string" ? value.trim() : "";
  return ownerPattern.test(owner) ? owner : undefined;
}

function normalizeGitHubRepo(value: unknown): string | undefined {
  const repo = typeof value === "string" ? value.trim() : "";
  return repoPattern.test(repo) ? repo : undefined;
}

function normalizeWorkflowNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const names: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const name = normalizeWorkflowName(item);

    if (!name || seen.has(name)) {
      continue;
    }

    seen.add(name);
    names.push(name);
  }

  return names;
}

function normalizePullRequestScope(value: unknown): WatchedPullRequestScope | undefined {
  return value === "all" || value === "user" ? value : undefined;
}

function normalizeWorkflowName(value: unknown): string | undefined {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length > 0 ? name : undefined;
}

function toggleWatchedWorkflowName(
  watchedRepo: WatchedRepo,
  scope: WatchedWorkflowSubscriptionScope,
  workflowName: string,
): WatchedRepo {
  const key = scope === "defaultBranch" ? "defaultBranchWorkflowNames" : "userWorkflowNames";
  const currentNames = watchedRepo[key] ?? [];
  const nextNames = currentNames.includes(workflowName)
    ? currentNames.filter((name) => name !== workflowName)
    : [...currentNames, workflowName];
  const nextWatchedRepo = { ...watchedRepo };

  if (nextNames.length) {
    nextWatchedRepo[key] = nextNames;
  } else {
    delete nextWatchedRepo[key];
  }

  return nextWatchedRepo;
}

function hasWatchedRepoSubscriptions(repo: WatchedRepo): boolean {
  return Boolean(getWatchedPullRequestScope(repo)) || hasWatchedWorkflowSubscriptions(repo);
}
