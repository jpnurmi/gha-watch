export type WorkflowSubscriptionBranch =
  | { kind: "default" }
  | { kind: "exact"; name: string }
  | { kind: "any" };

export type WorkflowSubscription = {
  workflowName: string;
  branch: WorkflowSubscriptionBranch;
  events: string[];
  actor: "any" | "currentUser";
};

export type WatchedRepo = {
  owner: string;
  repo: string;
  repoIconUrl?: string;
  pullRequestScope?: WatchedPullRequestScope;
  workflowSubscriptions?: WorkflowSubscription[];
  /** Read-only compatibility for settings written before workflow subscriptions were normalized. */
  defaultBranchWorkflowNames?: string[];
  /** Read-only compatibility for settings written before workflow subscriptions were normalized. */
  userWorkflowNames?: string[];
};

export type WatchedPullRequestScope = "all" | "user";

export type WorkflowRunMatchCandidate = {
  workflowName?: string;
  branchName?: string;
  event?: string;
  actorLogin?: string;
};

export type WorkflowSubscriptionMatchContext = {
  defaultBranch?: string;
  currentUserLogin?: string;
};

const ownerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const repoPattern = /^[A-Za-z0-9._-]+$/;
const workflowEventPattern = /^(?:\*|[a-z0-9_]+)$/;

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

export function normalizeWorkflowSubscription(value: unknown): WorkflowSubscription | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const workflowName = normalizeWorkflowName(value.workflowName);
  const branch = normalizeWorkflowSubscriptionBranch(value.branch);
  const events = normalizeWorkflowEvents(value.events);
  const actor = value.actor === "any" || value.actor === "currentUser" ? value.actor : undefined;

  if (!workflowName || !branch || events.length === 0 || !actor) {
    return undefined;
  }

  return { workflowName, branch, events, actor };
}

export function normalizeWorkflowSubscriptions(value: unknown): WorkflowSubscription[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const subscriptions = value
    .map(normalizeWorkflowSubscription)
    .filter((subscription): subscription is WorkflowSubscription => Boolean(subscription));
  const deduped = new Map(
    subscriptions.map((subscription) => [getWorkflowSubscriptionId(subscription), subscription]),
  );

  return [...deduped.values()].sort(compareWorkflowSubscriptions);
}

export function getWorkflowSubscriptions(repo: WatchedRepo): WorkflowSubscription[] {
  if (repo.workflowSubscriptions) {
    return normalizeWorkflowSubscriptions(repo.workflowSubscriptions);
  }

  return normalizeWorkflowSubscriptions([
    ...(repo.defaultBranchWorkflowNames ?? []).map((workflowName) => ({
      workflowName,
      branch: { kind: "default" },
      events: ["*"],
      actor: "any",
    })),
    ...(repo.userWorkflowNames ?? []).map((workflowName) => ({
      workflowName,
      branch: { kind: "any" },
      events: ["workflow_dispatch"],
      actor: "currentUser",
    })),
  ]);
}

export function getWorkflowSubscriptionId(subscription: WorkflowSubscription): string {
  const branch = subscription.branch.kind === "exact"
    ? `exact:${subscription.branch.name}`
    : subscription.branch.kind;
  return JSON.stringify([
    subscription.workflowName,
    branch,
    subscription.events,
    subscription.actor,
  ]);
}

export function addWatchedWorkflowSubscription(
  watchedRepos: WatchedRepo[],
  repo: Pick<WatchedRepo, "owner" | "repo">,
  subscription: WorkflowSubscription,
): WatchedRepo[] {
  const normalized = normalizeWorkflowSubscription(subscription);

  if (!normalized) {
    return watchedRepos;
  }

  const watchedRepo = watchedRepos.find((item) => getWatchedRepoKey(item) === getWatchedRepoKey(repo));
  const currentSubscriptions = watchedRepo ? getWorkflowSubscriptions(watchedRepo) : [];
  const nextSubscriptions = normalizeWorkflowSubscriptions([...currentSubscriptions, normalized]);

  if (nextSubscriptions.length === currentSubscriptions.length) {
    return watchedRepos;
  }

  if (!watchedRepo) {
    return [...watchedRepos, {
      owner: repo.owner,
      repo: repo.repo,
      workflowSubscriptions: nextSubscriptions,
    }];
  }

  return watchedRepos.map((item) => item === watchedRepo
    ? withWorkflowSubscriptions(item, nextSubscriptions)
    : item);
}

export function updateWatchedWorkflowSubscription(
  watchedRepos: WatchedRepo[],
  repo: Pick<WatchedRepo, "owner" | "repo">,
  subscriptionId: string,
  subscription: WorkflowSubscription,
): WatchedRepo[] {
  const normalized = normalizeWorkflowSubscription(subscription);
  const watchedRepo = watchedRepos.find((item) => getWatchedRepoKey(item) === getWatchedRepoKey(repo));

  if (!normalized || !watchedRepo) {
    return watchedRepos;
  }

  const currentSubscriptions = getWorkflowSubscriptions(watchedRepo);

  if (!currentSubscriptions.some((item) => getWorkflowSubscriptionId(item) === subscriptionId)) {
    return watchedRepos;
  }

  const nextSubscriptions = normalizeWorkflowSubscriptions([
    ...currentSubscriptions.filter((item) => getWorkflowSubscriptionId(item) !== subscriptionId),
    normalized,
  ]);

  if (JSON.stringify(nextSubscriptions) === JSON.stringify(currentSubscriptions)) {
    return watchedRepos;
  }

  return watchedRepos.map((item) => item === watchedRepo
    ? withWorkflowSubscriptions(item, nextSubscriptions)
    : item);
}

export function removeWatchedWorkflowSubscription(
  watchedRepos: WatchedRepo[],
  repo: Pick<WatchedRepo, "owner" | "repo">,
  subscriptionId: string,
): WatchedRepo[] {
  const watchedRepo = watchedRepos.find((item) => getWatchedRepoKey(item) === getWatchedRepoKey(repo));

  if (!watchedRepo) {
    return watchedRepos;
  }

  const currentSubscriptions = getWorkflowSubscriptions(watchedRepo);
  const nextSubscriptions = currentSubscriptions.filter(
    (subscription) => getWorkflowSubscriptionId(subscription) !== subscriptionId,
  );

  if (nextSubscriptions.length === currentSubscriptions.length) {
    return watchedRepos;
  }

  const nextWatchedRepo = withWorkflowSubscriptions(watchedRepo, nextSubscriptions);

  return hasWatchedRepoSubscriptions(nextWatchedRepo)
    ? watchedRepos.map((item) => item === watchedRepo ? nextWatchedRepo : item)
    : watchedRepos.filter((item) => item !== watchedRepo);
}

export function workflowRunMatchesSubscription(
  run: WorkflowRunMatchCandidate,
  subscription: WorkflowSubscription,
  context: WorkflowSubscriptionMatchContext,
): boolean {
  if (run.workflowName !== subscription.workflowName) {
    return false;
  }

  if (!subscription.events.includes("*") && (!run.event || !subscription.events.includes(run.event))) {
    return false;
  }

  if (subscription.branch.kind === "default" && run.branchName !== context.defaultBranch) {
    return false;
  }

  if (subscription.branch.kind === "exact" && run.branchName !== subscription.branch.name) {
    return false;
  }

  if (subscription.actor === "currentUser") {
    const actor = run.actorLogin?.trim().toLowerCase();
    const user = context.currentUserLogin?.trim().toLowerCase();

    if (!actor || !user || actor !== user) {
      return false;
    }
  }

  return true;
}

export function isValidExactBranchName(value: string): boolean {
  const name = value.trim();

  return name.length > 0 &&
    name.length <= 255 &&
    !/[\u0000-\u0020\u007f~^:?*[\\]/.test(name) &&
    !name.startsWith("/") &&
    !name.endsWith("/") &&
    !name.endsWith(".") &&
    !name.includes("//") &&
    !name.includes("..") &&
    !name.includes("@{") &&
    !name.split("/").some((part) => part.endsWith(".lock"));
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

export function hasWatchedWorkflowSubscriptions(repo: WatchedRepo): boolean {
  return getWorkflowSubscriptions(repo).length > 0;
}

export function getWatchedPullRequestScope(repo: WatchedRepo): WatchedPullRequestScope | undefined {
  return repo.pullRequestScope;
}

export function getWatchedRepoKey(repo: Pick<WatchedRepo, "owner" | "repo">): string {
  return `${repo.owner}/${repo.repo}`;
}

function normalizeWatchedRepo(value: unknown): WatchedRepo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const owner = normalizeGitHubOwner(value.owner);
  const repo = normalizeGitHubRepo(value.repo);

  if (!owner || !repo) {
    return undefined;
  }

  const repoIconUrl = typeof value.repoIconUrl === "string" && value.repoIconUrl.length > 0
    ? value.repoIconUrl
    : undefined;
  const workflowSubscriptions = value.workflowSubscriptions === undefined
    ? getLegacyWorkflowSubscriptions(value)
    : normalizeWorkflowSubscriptions(value.workflowSubscriptions);
  const pullRequestScope = normalizePullRequestScope(value.pullRequestScope);

  if (!pullRequestScope && workflowSubscriptions.length === 0) {
    return undefined;
  }

  return {
    owner,
    repo,
    ...(repoIconUrl ? { repoIconUrl } : {}),
    ...(pullRequestScope ? { pullRequestScope } : {}),
    ...(workflowSubscriptions.length ? { workflowSubscriptions } : {}),
  };
}

function getLegacyWorkflowSubscriptions(record: Record<string, unknown>): WorkflowSubscription[] {
  return normalizeWorkflowSubscriptions([
    ...normalizeWorkflowNames(record.defaultBranchWorkflowNames).map((workflowName) => ({
      workflowName,
      branch: { kind: "default" },
      events: ["*"],
      actor: "any",
    })),
    ...normalizeWorkflowNames(record.userWorkflowNames).map((workflowName) => ({
      workflowName,
      branch: { kind: "any" },
      events: ["workflow_dispatch"],
      actor: "currentUser",
    })),
  ]);
}

function normalizeWorkflowSubscriptionBranch(value: unknown): WorkflowSubscriptionBranch | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.kind === "default" || value.kind === "any") {
    return { kind: value.kind };
  }

  if (value.kind === "exact" && typeof value.name === "string" && isValidExactBranchName(value.name)) {
    return { kind: "exact", name: value.name.trim() };
  }

  return undefined;
}

function normalizeWorkflowEvents(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const events = [...new Set(value
    .map((event) => typeof event === "string" ? event.trim().toLowerCase() : "")
    .filter((event) => workflowEventPattern.test(event)))]
    .sort((left, right) => left.localeCompare(right));

  return events.includes("*") ? ["*"] : events;
}

function compareWorkflowSubscriptions(left: WorkflowSubscription, right: WorkflowSubscription): number {
  return left.workflowName.localeCompare(right.workflowName) ||
    compareSubscriptionBranches(left.branch, right.branch) ||
    left.actor.localeCompare(right.actor) ||
    left.events.join(",").localeCompare(right.events.join(","));
}

function compareSubscriptionBranches(
  left: WorkflowSubscriptionBranch,
  right: WorkflowSubscriptionBranch,
): number {
  const order = { default: 0, any: 1, exact: 2 };
  return order[left.kind] - order[right.kind] ||
    (left.kind === "exact" ? left.name : "").localeCompare(right.kind === "exact" ? right.name : "");
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

  return [...new Set(value
    .map(normalizeWorkflowName)
    .filter((name): name is string => Boolean(name)))];
}

function normalizePullRequestScope(value: unknown): WatchedPullRequestScope | undefined {
  return value === "all" || value === "user" ? value : undefined;
}

function normalizeWorkflowName(value: unknown): string | undefined {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length > 0 ? name : undefined;
}

function withWorkflowSubscriptions(
  watchedRepo: WatchedRepo,
  workflowSubscriptions: WorkflowSubscription[],
): WatchedRepo {
  const nextWatchedRepo = { ...watchedRepo };
  delete nextWatchedRepo.defaultBranchWorkflowNames;
  delete nextWatchedRepo.userWorkflowNames;

  if (workflowSubscriptions.length > 0) {
    nextWatchedRepo.workflowSubscriptions = workflowSubscriptions;
  } else {
    delete nextWatchedRepo.workflowSubscriptions;
  }

  return nextWatchedRepo;
}

function hasWatchedRepoSubscriptions(repo: WatchedRepo): boolean {
  return Boolean(getWatchedPullRequestScope(repo)) || hasWatchedWorkflowSubscriptions(repo);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
