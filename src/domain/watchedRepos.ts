export type WatchedRepo = {
  owner: string;
  repo: string;
  repoIconUrl?: string;
  pullRequestScope?: WatchedPullRequestScope;
  workflowTargets?: WatchedWorkflowTarget[];
  /** Legacy settings accepted during migration. */
  defaultBranchWorkflowNames?: string[];
  /** Legacy settings accepted during migration. */
  userWorkflowNames?: string[];
};

export type WatchedPullRequestScope = "all" | "user";
export type WatchedWorkflowTargetKind = "default" | "own" | "all" | "include" | "exclude";

export type WatchedWorkflowTarget = {
  kind: WatchedWorkflowTargetKind;
  pattern?: string;
  workflowNames: string[];
};

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
  targetKey: string,
  workflowName: string,
): WatchedRepo[] {
  const cleanWorkflowName = normalizeWorkflowName(workflowName);

  if (!cleanWorkflowName) {
    return watchedRepos;
  }

  const watchedRepo = watchedRepos.find((item) => getWatchedRepoKey(item) === getWatchedRepoKey(repo));
  const currentRepo = watchedRepo ?? { owner: repo.owner, repo: repo.repo };
  const workflowTarget = currentRepo.workflowTargets?.find(
    (target) => getWatchedWorkflowTargetKey(target) === targetKey,
  );

  if (!workflowTarget) {
    return watchedRepos;
  }

  const nextNames = workflowTarget.workflowNames.includes(cleanWorkflowName)
    ? workflowTarget.workflowNames.filter((name) => name !== cleanWorkflowName)
    : [...workflowTarget.workflowNames, cleanWorkflowName];
  const nextWatchedRepo = {
    ...currentRepo,
    workflowTargets: currentRepo.workflowTargets?.map((target) =>
      target === workflowTarget ? { ...target, workflowNames: nextNames } : target
    ),
  };

  if (!watchedRepo) {
    return [...watchedRepos, nextWatchedRepo];
  }

  if (!hasWatchedRepoSubscriptions(nextWatchedRepo)) {
    return watchedRepos.filter((item) => item !== watchedRepo);
  }

  return watchedRepos.map((item) => (item === watchedRepo ? nextWatchedRepo : item));
}

export function addWatchedWorkflowTarget(
  watchedRepos: WatchedRepo[],
  repo: Pick<WatchedRepo, "owner" | "repo">,
  target: Pick<WatchedWorkflowTarget, "kind" | "pattern">,
): WatchedRepo[] {
  const normalized = normalizeWorkflowTarget({ ...target, workflowNames: [] });

  if (!normalized) {
    return watchedRepos;
  }

  const watchedRepo = watchedRepos.find((item) => getWatchedRepoKey(item) === getWatchedRepoKey(repo));
  const currentRepo = watchedRepo ?? { owner: repo.owner, repo: repo.repo };
  const targetKey = getWatchedWorkflowTargetKey(normalized);

  if (currentRepo.workflowTargets?.some((item) => getWatchedWorkflowTargetKey(item) === targetKey)) {
    return watchedRepos;
  }

  const nextWatchedRepo = {
    ...currentRepo,
    workflowTargets: [...(currentRepo.workflowTargets ?? []), normalized],
  };

  return watchedRepo
    ? watchedRepos.map((item) => item === watchedRepo ? nextWatchedRepo : item)
    : [...watchedRepos, nextWatchedRepo];
}

export function removeWatchedWorkflowTarget(
  watchedRepos: WatchedRepo[],
  repo: Pick<WatchedRepo, "owner" | "repo">,
  targetKey: string,
): WatchedRepo[] {
  const watchedRepo = watchedRepos.find((item) => getWatchedRepoKey(item) === getWatchedRepoKey(repo));

  if (!watchedRepo?.workflowTargets?.some((target) => getWatchedWorkflowTargetKey(target) === targetKey)) {
    return watchedRepos;
  }

  const workflowTargets = watchedRepo.workflowTargets.filter(
    (target) => getWatchedWorkflowTargetKey(target) !== targetKey,
  );
  const nextWatchedRepo: WatchedRepo = {
    ...watchedRepo,
    ...(workflowTargets.length ? { workflowTargets } : {}),
  };

  if (workflowTargets.length === 0) {
    delete nextWatchedRepo.workflowTargets;
  }

  return hasWatchedRepoSubscriptions(nextWatchedRepo)
    ? watchedRepos.map((item) => item === watchedRepo ? nextWatchedRepo : item)
    : watchedRepos.filter((item) => item !== watchedRepo);
}

export function hasWatchedWorkflowSubscriptions(repo: WatchedRepo): boolean {
  return getWatchedWorkflowTargets(repo).some((target) => target.workflowNames.length > 0);
}

export function getWatchedWorkflowTargetKey(target: Pick<WatchedWorkflowTarget, "kind" | "pattern">): string {
  return target.pattern ? `${target.kind}:${target.pattern}` : target.kind;
}

export function getWatchedWorkflowTargets(repo: WatchedRepo): WatchedWorkflowTarget[] {
  return normalizeWorkflowTargets(repo.workflowTargets, repo as unknown as Record<string, unknown>);
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
  const workflowTargets = normalizeWorkflowTargets(record.workflowTargets, record);
  const pullRequestScope = normalizePullRequestScope(record.pullRequestScope);

  if (!pullRequestScope && workflowTargets.length === 0) {
    return undefined;
  }

  return {
    owner,
    repo,
    ...(repoIconUrl ? { repoIconUrl } : {}),
    ...(pullRequestScope ? { pullRequestScope } : {}),
    ...(workflowTargets.length ? { workflowTargets } : {}),
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

function normalizeWorkflowTargets(value: unknown, legacy: Record<string, unknown>): WatchedWorkflowTarget[] {
  const targets: WatchedWorkflowTarget[] = [];
  const byKey = new Map<string, WatchedWorkflowTarget>();

  function add(target: WatchedWorkflowTarget | undefined): void {
    if (!target) {
      return;
    }

    const key = getWatchedWorkflowTargetKey(target);
    const existing = byKey.get(key);

    if (existing) {
      existing.workflowNames = normalizeWorkflowNames([...existing.workflowNames, ...target.workflowNames]);
      return;
    }

    byKey.set(key, target);
    targets.push(target);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      add(normalizeWorkflowTarget(item));
    }
  }

  const defaultBranchWorkflowNames = normalizeWorkflowNames(legacy.defaultBranchWorkflowNames);
  const userWorkflowNames = normalizeWorkflowNames(legacy.userWorkflowNames);

  if (defaultBranchWorkflowNames.length > 0) {
    add({ kind: "default", workflowNames: defaultBranchWorkflowNames });
  }

  if (userWorkflowNames.length > 0) {
    add({ kind: "own", workflowNames: userWorkflowNames });
  }

  return targets;
}

function normalizeWorkflowTarget(value: unknown): WatchedWorkflowTarget | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const kind = normalizeWorkflowTargetKind(record.kind);

  if (!kind) {
    return undefined;
  }

  const pattern = kind === "include" || kind === "exclude"
    ? normalizeBranchPattern(record.pattern)
    : undefined;

  if ((kind === "include" || kind === "exclude") && !pattern) {
    return undefined;
  }

  return {
    kind,
    ...(pattern ? { pattern } : {}),
    workflowNames: normalizeWorkflowNames(record.workflowNames),
  };
}

function normalizeWorkflowTargetKind(value: unknown): WatchedWorkflowTargetKind | undefined {
  return value === "default" || value === "own" || value === "all" || value === "include" || value === "exclude"
    ? value
    : undefined;
}

function normalizeBranchPattern(value: unknown): string | undefined {
  const pattern = typeof value === "string" ? value.trim() : "";
  return pattern.length > 0 && pattern.length <= 255 && !/[\0\r\n]/.test(pattern) ? pattern : undefined;
}

function normalizePullRequestScope(value: unknown): WatchedPullRequestScope | undefined {
  return value === "all" || value === "user" ? value : undefined;
}

function normalizeWorkflowName(value: unknown): string | undefined {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length > 0 ? name : undefined;
}

function hasWatchedRepoSubscriptions(repo: WatchedRepo): boolean {
  return Boolean(getWatchedPullRequestScope(repo)) ||
    Boolean(repo.workflowTargets?.length) ||
    hasWatchedWorkflowSubscriptions(repo);
}
