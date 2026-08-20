import type {
  ParsedWatchTarget,
  PrWatchTarget,
  WatchTarget,
} from "../domain/githubUrl";
import type { WatchState } from "../domain/status";
import type { PrSourceState, WatchMetadata, WatchTiming } from "../domain/watches";

export type ShellResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type ShellExecutor = {
  execute(program: string, args: string[]): Promise<ShellResult>;
};

type ConditionalApiCacheEntry = {
  body: string;
  etag: string;
};

const conditionalApiCaches = new WeakMap<ShellExecutor, Map<string, ConditionalApiCacheEntry>>();
const conditionalApiCacheLimit = 1_000;
let sharedTauriShellExecutor: ShellExecutor | undefined;

export type RerunMode = "all" | "failed";

export type WatchSnapshot = WatchState & {
  title: string;
  metadata?: WatchMetadata;
  prNumber?: string;
  timing?: WatchTiming;
  url: string;
};

type RunViewResponse = {
  status?: string;
  conclusion?: string | null;
  created_at?: string;
  display_title?: string;
  head_branch?: string | null;
  head_sha?: string | null;
  html_url?: string;
  jobs_url?: string;
  name?: string;
  pull_requests?: PullRequestReference[];
  run_started_at?: string;
  updated_at?: string;
};

type RunJobsResponse = {
  jobs?: RunJobResponse[];
};

type RunJobResponse = {
  conclusion?: string | null;
  status?: string;
};

type JobViewResponse = {
  status?: string;
  conclusion?: string | null;
  completed_at?: string | null;
  created_at?: string;
  head_branch?: string | null;
  headBranch?: string | null;
  name?: string;
  started_at?: string | null;
  workflow_name?: string;
  html_url?: string;
};

type PrCheckResponse = {
  bucket?: string;
  completedAt?: string | null;
  link?: string;
  startedAt?: string | null;
};

type PullRequestDetailsResponse = {
  author?: {
    login?: string;
  } | null;
  headRefName?: string;
  isDraft?: boolean;
  state?: string;
  title?: string;
};

type PullRequestDetailsQueryResponse = {
  data?: Record<
    string,
    {
      pullRequest?: PullRequestDetailsResponse | null;
    } | null
  >;
};

type RepositoryViewResponse = {
  default_branch?: string;
  owner?: {
    avatar_url?: string;
  };
};

type CommitViewResponse = {
  sha?: string;
};

type UserViewResponse = {
  login?: string;
};

export type OpenPullRequest = {
  number: string;
  title: string;
  isDraft: boolean;
  authorLogin?: string;
  headBranch?: string;
  state?: PrSourceState;
  checkSnapshot?: WatchSnapshot;
  updatedAt?: string;
  url: string;
};

export type OpenPullRequestCheckOptions = {
  author?: "@me";
};

export type AuthoredOpenPullRequest = OpenPullRequest & {
  owner: string;
  repo: string;
};

export type PullRequestDetails = {
  authorLogin?: string;
  branchName?: string;
  state: PrSourceState;
  title: string;
};

export type PullRequestDetailsBatch = Array<PullRequestDetails | undefined>;

export type ActiveWorkflowRun = {
  runId: string;
  title: string;
  runTitle?: string;
  event?: string;
  workflowName?: string;
  actorLogin?: string;
  status: string;
  conclusion?: string | null;
  branchName?: string;
  commitSha?: string;
  pullRequests?: WorkflowRunPullRequest[];
  createdAt?: string;
  startedAt?: string;
  updatedAt?: string;
  url: string;
};

export type WorkflowRunSummary = ActiveWorkflowRun & {
  conclusion: string | null;
  createdAt: string;
  pullRequests: WorkflowRunPullRequest[];
};

export type WorkflowRunPullRequest = {
  number: string;
  authorLogin?: string;
};

export type RepositoryCiStatusTone = "success" | "pending" | "failure";

export type RepositoryCiStatus = {
  tone: RepositoryCiStatusTone;
  label: string;
  description: string;
  defaultBranch: string;
  workflows: RepositoryCiWorkflowStatus[];
  commitSha?: string;
  updatedAt?: string;
  url?: string;
};

export type RepositoryCiStatusOptions = {
  commitSha?: string;
  defaultBranch?: string;
};

export type RepositoryCiWorkflowStatus = {
  tone: RepositoryCiStatusTone;
  label: string;
  description: string;
  name: string;
  url: string;
  updatedAt?: string;
};

export type WorkflowDefinition = {
  name: string;
  path: string;
  state?: string;
};

type PullRequestListResponse = {
  author?: {
    login?: string;
  };
  headRefName?: string;
  isDraft?: boolean;
  number?: number | string;
  title?: string;
  updatedAt?: string;
  url?: string;
  statusCheckRollup?: PullRequestCheckResponse[];
};

type PullRequestCheckResponse = {
  __typename?: string;
  completedAt?: string | null;
  conclusion?: string | null;
  context?: string;
  name?: string;
  startedAt?: string | null;
  state?: string;
  status?: string;
  workflowName?: string;
};

type PullRequestSearchResponse = PullRequestListResponse & {
  repository?: {
    nameWithOwner?: string;
  };
};

type WorkflowRunListResponse = {
  conclusion?: string | null;
  createdAt?: string;
  databaseId?: number | string;
  displayTitle?: string;
  event?: string;
  headBranch?: string | null;
  headSha?: string | null;
  status?: string;
  updatedAt?: string;
  url?: string;
  workflowDatabaseId?: number | string;
  workflowName?: string;
};

type WorkflowRunsApiResponse = {
  total_count?: number;
  workflow_runs?: WorkflowRunApiResponse[];
};

type WorkflowRunApiResponse = {
  actor?: {
    login?: string;
  };
  conclusion?: string | null;
  created_at?: string;
  display_title?: string;
  event?: string;
  head_branch?: string | null;
  head_sha?: string | null;
  html_url?: string;
  id?: number | string;
  name?: string;
  pull_requests?: WorkflowRunPullRequestResponse[];
  run_started_at?: string;
  status?: string;
  updated_at?: string;
  workflow_id?: number | string;
};

type WorkflowRunPullRequestResponse = PullRequestReference & {
  author?: {
    login?: string;
  } | null;
  user?: {
    login?: string;
  } | null;
};

type WorkflowListResponse = {
  name?: string;
  path?: string;
  state?: string;
};

type PullRequestReference = {
  base?: {
      repo?: {
        full_name?: string;
        url?: string;
    };
  };
  number?: number | string;
};

export async function fetchWatchState(
  target: WatchTarget,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<WatchSnapshot> {
  try {
    if (target.kind === "pr") {
      const result = await executor.execute("gh", [
        "pr",
        "checks",
        target.prNumber,
        "-R",
        `${target.owner}/${target.repo}`,
        "--json",
        "bucket,completedAt,startedAt",
      ]);

      assertSuccessfulGhResult(result, result.stdout.trim() ? [1, 8] : [8]);
      return toPrSnapshot(target, parseJson<PrCheckResponse[]>(result.stdout));
    }

    if (target.kind === "run") {
      const response = await fetchConditionalApiJson<RunViewResponse>(executor, [
        `repos/${target.owner}/${target.repo}/actions/runs/${target.runId}`,
      ]);
      const failedChildren = shouldFetchRunJobs(response)
        ? await fetchRunFailedChildren(target, executor)
        : undefined;

      return toRunSnapshot(target, response, failedChildren);
    }

    const response = await fetchConditionalApiJson<JobViewResponse>(executor, [
      `repos/${target.owner}/${target.repo}/actions/jobs/${target.jobId}`,
    ]);
    return toJobSnapshot(target.url, response);
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchRepositoryIconUrl(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<string | undefined> {
  try {
    const result = await executor.execute("gh", ["api", `repos/${target.owner}/${target.repo}`]);

    assertSuccessfulGhResult(result);
    return parseJson<RepositoryViewResponse>(result.stdout).owner?.avatar_url;
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchRepositoryDefaultBranch(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<string> {
  try {
    const result = await executor.execute("gh", ["api", `repos/${target.owner}/${target.repo}`]);

    assertSuccessfulGhResult(result);
    return requiredString(parseJson<RepositoryViewResponse>(result.stdout).default_branch, "repository default branch");
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchRepositoryCommitSha(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  ref: string,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<string> {
  try {
    const commit = await fetchConditionalApiJson<CommitViewResponse>(executor, [
      `repos/${target.owner}/${target.repo}/commits/${encodeURIComponent(ref)}`,
    ]);

    return requiredString(commit.sha, "repository commit");
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchRepositoryDefaultBranchCiStatus(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  options: RepositoryCiStatusOptions = {},
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<RepositoryCiStatus> {
  try {
    const defaultBranch = options.defaultBranch ?? await fetchRepositoryDefaultBranch(target, executor);
    const commitSha = options.commitSha ?? await fetchRepositoryCommitSha(target, defaultBranch, executor);
    const response = await fetchConditionalApiJson<WorkflowRunsApiResponse>(executor, [
      `repos/${target.owner}/${target.repo}/actions/runs`,
      "--method",
      "GET",
      "-f",
      `branch=${defaultBranch}`,
      "-f",
      `head_sha=${commitSha}`,
      "-f",
      "event=push",
      "-F",
      "per_page=100",
    ]);
    const runs = Array.isArray(response.workflow_runs)
      ? response.workflow_runs.map(normalizeRepositoryCiWorkflowRun)
      : [];

    return summarizeRepositoryCiStatus(defaultBranch, commitSha, runs);
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchAuthenticatedUserLogin(
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<string> {
  try {
    const result = await executor.execute("gh", ["api", "user"]);

    assertSuccessfulGhResult(result);
    return requiredString(parseJson<UserViewResponse>(result.stdout).login, "authenticated user login");
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchOpenPullRequests(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<OpenPullRequest[]> {
  return fetchOpenPullRequestList(target, false, undefined, executor);
}

export async function fetchOpenPullRequestsWithChecks(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  options: OpenPullRequestCheckOptions = {},
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<OpenPullRequest[]> {
  return fetchOpenPullRequestList(target, true, options.author, executor);
}

async function fetchOpenPullRequestList(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  includeChecks: boolean,
  author: "@me" | undefined,
  executor: ShellExecutor,
): Promise<OpenPullRequest[]> {
  try {
    const args = [
      "pr",
      "list",
      "-R",
      `${target.owner}/${target.repo}`,
      "--state",
      "open",
      "--limit",
      "100",
      ...(author ? ["--author", author] : []),
      "--json",
      `number,title,isDraft,author,headRefName,updatedAt,url${includeChecks ? ",statusCheckRollup" : ""}`,
    ];
    const result = await executor.execute("gh", args);

    assertSuccessfulGhResult(result);

    return parseJson<PullRequestListResponse[]>(result.stdout)
      .map((response) => normalizeOpenPullRequest(response, includeChecks ? target : undefined))
      .filter((pullRequest): pullRequest is OpenPullRequest => Boolean(pullRequest))
      .sort(comparePullRequestsByUpdatedAt);
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchAuthoredOpenPullRequests(
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<AuthoredOpenPullRequest[]> {
  try {
    const result = await executor.execute("gh", [
      "search",
      "prs",
      "--author",
      "@me",
      "--state",
      "open",
      "--sort",
      "updated",
      "--order",
      "desc",
      "--limit",
      "100",
      "--json",
      "number,title,isDraft,updatedAt,url,repository",
    ]);

    assertSuccessfulGhResult(result);

    return parseJson<PullRequestSearchResponse[]>(result.stdout)
      .map(normalizeAuthoredOpenPullRequest)
      .filter((pullRequest): pullRequest is AuthoredOpenPullRequest => Boolean(pullRequest))
      .sort(comparePullRequestsByUpdatedAt);
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchPullRequestDetails(
  targets: PrWatchTarget[],
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<PullRequestDetailsBatch> {
  const batchSize = 50;
  const details: PullRequestDetailsBatch = [];

  try {
    for (let offset = 0; offset < targets.length; offset += batchSize) {
      const batch = targets.slice(offset, offset + batchSize);
      const query = createPullRequestDetailsQuery(batch);
      const result = await executor.execute("gh", query.args);

      assertSuccessfulGhResult(result);
      const response = parseJson<PullRequestDetailsQueryResponse>(result.stdout);

      details.push(
        ...batch.map((_, index) => normalizePullRequestDetails(response.data?.[`repository${index}`]?.pullRequest)),
      );
    }

    return details;
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchWorkflowDefinitions(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<WorkflowDefinition[]> {
  try {
    const result = await executor.execute("gh", [
      "workflow",
      "list",
      "-R",
      `${target.owner}/${target.repo}`,
      "--limit",
      "100",
      "--json",
      "name,path,state",
    ]);

    assertSuccessfulGhResult(result);

    return parseJson<WorkflowListResponse[]>(result.stdout)
      .map(normalizeWorkflowDefinition)
      .filter((workflow): workflow is WorkflowDefinition => Boolean(workflow))
      .filter(dedupeWorkflowDefinitionNames())
      .sort(compareWorkflowDefinitionsByName);
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchActiveWorkflowRuns(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<ActiveWorkflowRun[]> {
  return fetchActiveWorkflowRunsWithArgs(target, [], executor);
}

export async function fetchUserActiveWorkflowRuns(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  userLogin: string,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<ActiveWorkflowRun[]> {
  const cleanUserLogin = userLogin.trim();

  if (!cleanUserLogin) {
    throw new Error("User workflow subscriptions need an authenticated GitHub user.");
  }

  return fetchActiveWorkflowRunsWithArgs(
    target,
    ["--user", cleanUserLogin],
    executor,
    (run) => run.event === "workflow_dispatch",
  );
}

const workflowRunsPerPage = 100;
export const workflowRunCatchUpPageLimit = 10;

export async function fetchWorkflowRunsSince(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  createdAfter: string,
  createdBefore: string,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<WorkflowRunSummary[]> {
  const runs = new Map<string, WorkflowRunSummary>();

  try {
    for (let page = 1; page <= workflowRunCatchUpPageLimit; page += 1) {
      const result = await executor.execute("gh", [
        "api",
        `repos/${target.owner}/${target.repo}/actions/runs`,
        "--method",
        "GET",
        "-f",
        `created=${createdAfter}..${createdBefore}`,
        "-F",
        `per_page=${workflowRunsPerPage}`,
        "-F",
        `page=${page}`,
      ]);

      assertSuccessfulGhResult(result);
      const response = parseJson<WorkflowRunsApiResponse>(result.stdout);
      const pageRuns = Array.isArray(response.workflow_runs) ? response.workflow_runs : [];

      for (const responseRun of pageRuns) {
        const run = normalizeWorkflowRunSummary(responseRun, target);

        if (run) {
          runs.set(run.runId, run);
        }
      }

      const totalCount = typeof response.total_count === "number" && response.total_count >= 0
        ? response.total_count
        : undefined;
      const coveredBoundary = pageRuns.length < workflowRunsPerPage ||
        (totalCount !== undefined && page * workflowRunsPerPage >= totalCount);

      if (coveredBoundary) {
        return [...runs.values()];
      }
    }

    throw new Error(
      `Workflow run catch-up exceeded the ${workflowRunCatchUpPageLimit * workflowRunsPerPage}-run scan limit.`,
    );
  } catch (error) {
    throw normalizeGhError(error);
  }
}

async function fetchActiveWorkflowRunsWithArgs(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  extraArgs: string[],
  executor: ShellExecutor,
  includeRun: (run: WorkflowRunListResponse) => boolean = () => true,
): Promise<ActiveWorkflowRun[]> {
  try {
    const results = await Promise.all(
      ["queued", "in_progress"].map(async (status) => {
        const result = await executor.execute("gh", [
          "run",
          "list",
          "-R",
          `${target.owner}/${target.repo}`,
          "--status",
          status,
          "--limit",
          "20",
          ...extraArgs,
          "--json",
          "databaseId,displayTitle,event,workflowName,headBranch,status,createdAt,updatedAt,url",
        ]);

        assertSuccessfulGhResult(result);
        return parseJson<WorkflowRunListResponse[]>(result.stdout);
      }),
    );

    return results
      .flat()
      .filter(includeRun)
      .map(normalizeActiveWorkflowRun)
      .filter((run): run is ActiveWorkflowRun => Boolean(run))
      .sort(compareWorkflowRunsByUpdatedAt);
  } catch (error) {
    throw normalizeGhError(error);
  }
}

function normalizeActiveWorkflowRun(response: WorkflowRunListResponse): ActiveWorkflowRun | undefined {
  const runId = getRunDatabaseId(response.databaseId);
  const event = response.event?.trim();
  const workflowName = response.workflowName?.trim();
  const title = joinTitle(workflowName, response.displayTitle);
  const status = response.status?.trim();
  const url = response.url?.trim();

  if (!runId || !status || !url || title === "GitHub Actions") {
    return undefined;
  }

  const branchName = response.headBranch?.trim();

  return {
    runId,
    title,
    ...(event ? { event } : {}),
    ...(workflowName ? { workflowName } : {}),
    status,
    ...(branchName ? { branchName } : {}),
    ...(response.createdAt ? { createdAt: response.createdAt } : {}),
    ...(response.updatedAt ? { updatedAt: response.updatedAt } : {}),
    url,
  };
}

function normalizeWorkflowRunSummary(
  response: WorkflowRunApiResponse,
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
): WorkflowRunSummary | undefined {
  const runId = getRunDatabaseId(response.id);
  const status = response.status?.trim();
  const url = response.html_url?.trim();
  const createdAt = normalizeApiTimestamp(response.created_at);
  const workflowName = response.name?.trim();
  const runTitle = response.display_title?.trim();
  const title = joinTitle(workflowName, runTitle);

  if (!runId || !status || !url || !createdAt || title === "GitHub Actions") {
    return undefined;
  }

  const event = response.event?.trim();
  const actorLogin = response.actor?.login?.trim();
  const branchName = response.head_branch?.trim();
  const commitSha = response.head_sha?.trim();
  const startedAt = normalizeApiTimestamp(response.run_started_at);
  const updatedAt = normalizeApiTimestamp(response.updated_at);
  const pullRequests = normalizeWorkflowRunPullRequests(response.pull_requests, target);

  return {
    runId,
    title,
    ...(runTitle ? { runTitle } : {}),
    ...(event ? { event } : {}),
    ...(workflowName ? { workflowName } : {}),
    ...(actorLogin ? { actorLogin } : {}),
    status,
    conclusion: normalizeConclusion(response.conclusion),
    ...(branchName ? { branchName } : {}),
    ...(commitSha ? { commitSha } : {}),
    createdAt,
    ...(startedAt ? { startedAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    pullRequests,
    url,
  };
}

function normalizeWorkflowRunPullRequests(
  references: WorkflowRunPullRequestResponse[] | undefined,
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
): WorkflowRunPullRequest[] {
  const pullRequests = new Map<string, WorkflowRunPullRequest>();

  for (const reference of references ?? []) {
    if (!pullRequestReferenceMatchesRepository(reference, target)) {
      continue;
    }

    const number = getPullRequestListNumber(reference.number);

    if (!number) {
      continue;
    }

    const authorLogin = reference.author?.login?.trim() || reference.user?.login?.trim();
    pullRequests.set(number, {
      number,
      ...(authorLogin ? { authorLogin } : {}),
    });
  }

  return [...pullRequests.values()];
}

function normalizeApiTimestamp(value: string | undefined): string | undefined {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return undefined;
  }

  return value;
}

function compareWorkflowRunsByUpdatedAt(left: ActiveWorkflowRun, right: ActiveWorkflowRun): number {
  return getSortTimestamp(right.updatedAt ?? right.createdAt) - getSortTimestamp(left.updatedAt ?? left.createdAt);
}

function normalizeOpenPullRequest(
  response: PullRequestListResponse,
  repo?: Pick<ParsedWatchTarget, "owner" | "repo">,
): OpenPullRequest | undefined {
  const number = getPullRequestListNumber(response.number);
  const title = response.title?.trim();
  const url = response.url?.trim();

  if (!number || !title || !url) {
    return undefined;
  }

  const target = repo
    ? { kind: "pr" as const, ...repo, prNumber: number, url }
    : undefined;
  const checks = response.statusCheckRollup
    ? normalizePullRequestChecks(response.statusCheckRollup)
    : undefined;

  return {
    number,
    title,
    isDraft: response.isDraft === true,
    ...(response.author?.login?.trim() ? { authorLogin: response.author.login.trim() } : {}),
    ...(response.headRefName?.trim() ? { headBranch: response.headRefName.trim() } : {}),
    ...(target && checks ? { checkSnapshot: toPrSnapshot(target, checks) } : {}),
    ...(response.updatedAt ? { updatedAt: response.updatedAt } : {}),
    url,
  };
}

function normalizePullRequestChecks(responses: PullRequestCheckResponse[]): PrCheckResponse[] {
  const latest = new Map<string, PullRequestCheckResponse>();

  for (const [index, response] of responses.entries()) {
    const key = getPullRequestCheckKey(response) ?? `unknown:${String(index)}`;
    const previous = latest.get(key);

    if (
      !previous ||
      getSortTimestamp(response.startedAt ?? undefined) >=
        getSortTimestamp(previous.startedAt ?? undefined)
    ) {
      latest.set(key, response);
    }
  }

  return [...latest.values()].map((response) => ({
    bucket: getPullRequestCheckBucket(response),
    completedAt: response.completedAt,
    startedAt: response.startedAt,
  }));
}

function getPullRequestCheckKey(response: PullRequestCheckResponse): string | undefined {
  const context = response.context?.trim();

  if (context) {
    return `context:${context}`;
  }

  const name = response.name?.trim();

  if (!name) {
    return undefined;
  }

  return `check:${response.workflowName?.trim() ?? ""}:${name}`;
}

function getPullRequestCheckBucket(response: PullRequestCheckResponse): string {
  const status = response.status?.trim().toUpperCase();
  const state = (
    response.state?.trim() ||
    (status === "COMPLETED" ? response.conclusion?.trim() : status)
  )?.toUpperCase();

  if (state === "SUCCESS") {
    return "pass";
  }

  if (state === "SKIPPED" || state === "NEUTRAL") {
    return "skipping";
  }

  if (
    state === "ERROR" ||
    state === "FAILURE" ||
    state === "TIMED_OUT" ||
    state === "ACTION_REQUIRED" ||
    state === "STALE" ||
    state === "STARTUP_FAILURE"
  ) {
    return "fail";
  }

  return state === "CANCELLED" ? "cancel" : "pending";
}

function normalizeAuthoredOpenPullRequest(
  response: PullRequestSearchResponse,
): AuthoredOpenPullRequest | undefined {
  const pullRequest = normalizeOpenPullRequest(response);
  const repository = response.repository?.nameWithOwner?.trim();
  const match = repository?.match(/^([^/]+)\/(.+)$/);

  if (!pullRequest || !match) {
    return undefined;
  }

  return {
    ...pullRequest,
    owner: match[1],
    repo: match[2],
  };
}

function normalizeWorkflowDefinition(response: WorkflowListResponse): WorkflowDefinition | undefined {
  const name = response.name?.trim();
  const path = response.path?.trim();

  if (!name || !path) {
    return undefined;
  }

  const state = response.state?.trim();

  return {
    name,
    path,
    ...(state ? { state } : {}),
  };
}

function dedupeWorkflowDefinitionNames(): (workflow: WorkflowDefinition) => boolean {
  const seen = new Set<string>();

  return (workflow) => {
    if (seen.has(workflow.name)) {
      return false;
    }

    seen.add(workflow.name);
    return true;
  };
}

function compareWorkflowDefinitionsByName(left: WorkflowDefinition, right: WorkflowDefinition): number {
  return left.name.localeCompare(right.name);
}

function summarizeRepositoryCiStatus(
  defaultBranch: string,
  commitSha: string,
  response: WorkflowRunListResponse[],
): RepositoryCiStatus {
  const workflows = getRepositoryCiWorkflowStatuses(
    response.filter((run) => isRepositoryCiRunForCommit(run, commitSha)),
  );

  if (workflows.length === 0) {
    return {
      tone: "pending",
      label: "Unknown",
      description: `${defaultBranch}: no default branch workflow runs found`,
      defaultBranch,
      commitSha,
      workflows,
    };
  }

  const updatedAt = getLatestRepositoryCiUpdatedAt(workflows);
  const url = getRepositoryCiSummaryUrl(workflows);
  const pendingCount = workflows.filter((workflow) => workflow.tone === "pending").length;

  if (pendingCount > 0) {
    return {
      tone: "pending",
      label: "Pending",
      description: `${defaultBranch}: ${formatWorkflowCount(pendingCount)} pending`,
      defaultBranch,
      commitSha,
      workflows,
      ...(updatedAt ? { updatedAt } : {}),
      ...(url ? { url } : {}),
    };
  }

  const failedCount = workflows.filter((workflow) => workflow.tone === "failure").length;

  if (failedCount > 0) {
    return {
      tone: "failure",
      label: "Failing",
      description: `${defaultBranch}: ${formatWorkflowCount(failedCount)} failing`,
      defaultBranch,
      commitSha,
      workflows,
      ...(updatedAt ? { updatedAt } : {}),
      ...(url ? { url } : {}),
    };
  }

  return {
    tone: "success",
    label: "Passing",
    description: `${defaultBranch}: ${formatWorkflowCount(workflows.length)} passed`,
    defaultBranch,
    commitSha,
    workflows,
    ...(updatedAt ? { updatedAt } : {}),
    ...(url ? { url } : {}),
  };
}

function isRepositoryCiRunForCommit(response: WorkflowRunListResponse, commitSha: string): boolean {
  const headSha = response.headSha?.trim();
  const event = response.event?.trim();
  return Boolean(headSha && headSha.toLowerCase() === commitSha.toLowerCase() && event === "push");
}

function getRepositoryCiWorkflowStatuses(response: WorkflowRunListResponse[]): RepositoryCiWorkflowStatus[] {
  const workflowsByKey = new Map<string, RepositoryCiWorkflowStatus>();

  for (const item of response) {
    const workflow = parseRepositoryCiWorkflowRun(item);

    if (!workflow) {
      continue;
    }

    const key = getRepositoryCiWorkflowKey(item, workflow);
    const current = workflowsByKey.get(key);

    if (!current || getSortTimestamp(workflow.updatedAt) > getSortTimestamp(current.updatedAt)) {
      workflowsByKey.set(key, workflow);
    }
  }

  return [...workflowsByKey.values()].sort(compareRepositoryCiWorkflowStatuses);
}

function normalizeRepositoryCiWorkflowRun(response: WorkflowRunApiResponse): WorkflowRunListResponse {
  return {
    conclusion: response.conclusion,
    createdAt: response.created_at,
    databaseId: response.id,
    displayTitle: response.display_title,
    event: response.event,
    headBranch: response.head_branch,
    headSha: response.head_sha,
    status: response.status,
    updatedAt: response.updated_at,
    url: response.html_url,
    workflowDatabaseId: response.workflow_id,
    workflowName: response.name,
  };
}

function parseRepositoryCiWorkflowRun(response: WorkflowRunListResponse | undefined): RepositoryCiWorkflowStatus | undefined {
  const status = response?.status?.trim();
  const url = response?.url?.trim();
  const workflowName = response?.workflowName?.trim();
  const displayTitle = response?.displayTitle?.trim();
  const name = workflowName || displayTitle || "latest workflow run";

  if (!status || !url) {
    return undefined;
  }

  const conclusion = response?.conclusion?.trim();
  const tone = getRepositoryCiWorkflowTone(status, conclusion);

  return {
    tone,
    label: getRepositoryCiWorkflowLabel(tone, conclusion),
    description: getRepositoryCiWorkflowDescription(name, status, conclusion),
    name,
    ...(response?.updatedAt ? { updatedAt: response.updatedAt } : {}),
    url,
  };
}

function getRepositoryCiWorkflowKey(
  response: WorkflowRunListResponse,
  workflow: Pick<RepositoryCiWorkflowStatus, "name">,
): string {
  const workflowDatabaseId = getRunDatabaseId(response.workflowDatabaseId);
  return workflowDatabaseId ? `workflow:${workflowDatabaseId}` : `workflow:${workflow.name.toLowerCase()}`;
}

function getRepositoryCiWorkflowTone(status: string, conclusion: string | undefined): RepositoryCiStatusTone {
  if (status !== "completed") {
    return "pending";
  }

  return isFailingRepositoryConclusion(conclusion) ? "failure" : "success";
}

function getRepositoryCiWorkflowLabel(tone: RepositoryCiStatusTone, conclusion: string | undefined): string {
  if (tone === "pending") {
    return "Pending";
  }

  if (tone === "failure") {
    return "Failing";
  }

  if (conclusion === "skipped") {
    return "Skipped";
  }

  return "Passing";
}

function getRepositoryCiWorkflowDescription(name: string, status: string, conclusion: string | undefined): string {
  if (status !== "completed") {
    return `${name} is ${formatWorkflowRunStatus(status)}`;
  }

  return `${name} ${formatWorkflowRunConclusion(conclusion)}`;
}

function compareRepositoryCiWorkflowStatuses(
  left: RepositoryCiWorkflowStatus,
  right: RepositoryCiWorkflowStatus,
): number {
  const toneOrder: Record<RepositoryCiStatusTone, number> = {
    failure: 0,
    pending: 1,
    success: 2,
  };

  return toneOrder[left.tone] - toneOrder[right.tone] || left.name.localeCompare(right.name);
}

function getLatestRepositoryCiUpdatedAt(workflows: RepositoryCiWorkflowStatus[]): string | undefined {
  return getLatestTimestamp(workflows.map((workflow) => workflow.updatedAt));
}

function getRepositoryCiSummaryUrl(workflows: RepositoryCiWorkflowStatus[]): string | undefined {
  return workflows.find((workflow) => workflow.tone === "failure")?.url ||
    workflows.find((workflow) => workflow.tone === "pending")?.url ||
    workflows[0]?.url;
}

function formatWorkflowCount(count: number): string {
  return `${count} workflow${count === 1 ? "" : "s"}`;
}

function formatWorkflowRunStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function formatWorkflowRunConclusion(conclusion: string | undefined): string {
  if (conclusion === "success") {
    return "passed";
  }

  return conclusion ? conclusion.replaceAll("_", " ") : "did not pass";
}

function isFailingRepositoryConclusion(conclusion: string | null | undefined): boolean {
  const cleanConclusion = conclusion?.trim();
  return Boolean(cleanConclusion && cleanConclusion !== "success" && cleanConclusion !== "neutral" && cleanConclusion !== "skipped");
}

function getPullRequestListNumber(value: number | string | undefined): string | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    return value;
  }

  return undefined;
}

function comparePullRequestsByUpdatedAt(left: OpenPullRequest, right: OpenPullRequest): number {
  return getSortTimestamp(right.updatedAt) - getSortTimestamp(left.updatedAt);
}

function getSortTimestamp(value: string | undefined): number {
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getRunDatabaseId(value: number | string | undefined): string | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    return value;
  }

  return undefined;
}

type RateLimitValues = {
  limit: number;
  used: number;
  remaining: number;
  reset: number;
};

export type RateLimit = RateLimitValues & {
  resource: "REST" | "GraphQL";
};

type RateLimitResponse = {
  resources: {
    core: RateLimitValues;
    graphql: RateLimitValues;
  };
};

function getRemainingRateLimitRatio(rateLimit: RateLimitValues): number {
  return rateLimit.limit > 0 ? rateLimit.remaining / rateLimit.limit : 0;
}

export async function fetchRateLimit(
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<RateLimit> {
  try {
    const result = await executor.execute("gh", ["api", "/rate_limit"]);

    assertSuccessfulGhResult(result);
    const response = parseJson<RateLimitResponse>(result.stdout);
    const core: RateLimit = { resource: "REST", ...response.resources.core };
    const graphql: RateLimit = { resource: "GraphQL", ...response.resources.graphql };

    return getRemainingRateLimitRatio(graphql) < getRemainingRateLimitRatio(core)
      ? graphql
      : core;
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function rerunWatch(
  target: WatchTarget,
  mode: RerunMode,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<void> {
  if (target.kind === "pr") {
    await rerunPullRequestChecks(target, mode, executor);
    return;
  }

  const runId = target.runId;

  if (!runId) {
    throw new Error("This job link does not include a workflow run id.");
  }

  try {
    assertSuccessfulGhResult(
      await executor.execute("gh", getRerunArgs(runId, target, mode)),
    );
  } catch (error) {
    throw normalizeGhError(error);
  }
}

async function rerunPullRequestChecks(
  target: PrWatchTarget,
  mode: RerunMode,
  executor: ShellExecutor,
): Promise<void> {
  try {
    const result = await executor.execute("gh", [
      "pr",
      "checks",
      target.prNumber,
      "-R",
      `${target.owner}/${target.repo}`,
      "--json",
      "bucket,link",
    ]);

    assertSuccessfulGhResult(result, result.stdout.trim() ? [1, 8] : [8]);
    const runIds = getPullRequestRunIds(target, parseJson<PrCheckResponse[]>(result.stdout), mode);

    if (runIds.length === 0) {
      throw new Error(
        mode === "failed"
          ? "No failed GitHub Actions jobs were found for this pull request."
          : "No failed or cancelled GitHub Actions jobs were found for this pull request.",
      );
    }

    for (const runId of runIds) {
      assertSuccessfulGhResult(
        await executor.execute("gh", getRerunArgs(runId, target, mode)),
      );
    }
  } catch (error) {
    throw normalizeGhError(error);
  }
}

function getRerunArgs(
  runId: string,
  target: Pick<WatchTarget, "owner" | "repo">,
  mode: RerunMode,
): string[] {
  return [
    "run",
    "rerun",
    runId,
    ...(mode === "failed" ? ["--failed"] : []),
    "-R",
    `${target.owner}/${target.repo}`,
  ];
}

function getPullRequestRunIds(
  target: PrWatchTarget,
  checks: PrCheckResponse[],
  mode: RerunMode,
): string[] {
  const runIds = checks
    .filter((check) => {
      const bucket = check.bucket?.trim();
      return bucket === "fail" || (mode === "all" && bucket === "cancel");
    })
    .map((check) => getActionsRunId(check.link, target))
    .filter((runId): runId is string => Boolean(runId));

  return [...new Set(runIds)];
}

function getActionsRunId(
  link: string | undefined,
  target: Pick<PrWatchTarget, "owner" | "repo">,
): string | undefined {
  if (!link) {
    return undefined;
  }

  try {
    const url = new URL(link);
    const [owner, repo, actions, runs, runId] = url.pathname.split("/").filter(Boolean);

    if (
      url.hostname !== "github.com" ||
      owner?.toLowerCase() !== target.owner.toLowerCase() ||
      repo?.toLowerCase() !== target.repo.toLowerCase() ||
      actions !== "actions" ||
      runs !== "runs" ||
      !/^\d+$/.test(runId)
    ) {
      return undefined;
    }

    return runId;
  } catch {
    return undefined;
  }
}

export function createTauriShellExecutor(): ShellExecutor {
  if (sharedTauriShellExecutor) {
    return sharedTauriShellExecutor;
  }

  sharedTauriShellExecutor = {
    async execute(program, args) {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const commands =
        program === "gh"
          ? [
              "gh",
              "gh-homebrew",
              "gh-usrlocal",
              "gh-usrbin",
              "gh-windows-program-files",
              "gh-windows-chocolatey",
            ]
          : [program];
      let lastError: unknown;

      for (const command of commands) {
        try {
          const output = await Command.create(command, args).execute();

          return {
            code: output.code ?? 1,
            stdout: output.stdout,
            stderr: output.stderr,
          };
        } catch (error) {
          lastError = error;

          if (!isMissingProgramError(error)) {
            throw error;
          }
        }
      }

      throw lastError;
    },
  };

  return sharedTauriShellExecutor;
}

async function fetchRunFailedChildren(
  target: Extract<WatchTarget, { kind: "run" }>,
  executor: ShellExecutor,
): Promise<boolean> {
  const response = await fetchConditionalApiJson<RunJobsResponse>(executor, [
    `repos/${target.owner}/${target.repo}/actions/runs/${target.runId}/jobs?per_page=100`,
  ]);
  return runJobsHaveFailures(response);
}

function shouldFetchRunJobs(response: RunViewResponse): boolean {
  return response.status === "in_progress" && Boolean(response.jobs_url);
}

function runJobsHaveFailures(response: RunJobsResponse): boolean {
  return Boolean(response.jobs?.some((job) => job.status === "completed" && isFailureConclusion(job.conclusion)));
}

function toRunSnapshot(
  target: Extract<WatchTarget, { kind: "run" }>,
  response: RunViewResponse,
  failedChildren = false,
): WatchSnapshot {
  const status = requiredString(response.status, "run status");
  const timing = compactTiming({
    queuedAt: response.created_at,
    startedAt: response.run_started_at,
    completedAt: status === "completed" ? response.updated_at : undefined,
  });
  const prNumber = getPullRequestNumber(response.pull_requests, target);

  return {
    status,
    conclusion: normalizeConclusion(response.conclusion),
    title: joinTitle(response.name, response.display_title),
    metadata: compactMetadata({
      workflowName: response.name,
      runTitle: response.display_title,
      branchName: response.head_branch ?? undefined,
      commitSha: response.head_sha ?? undefined,
    }),
    ...(failedChildren ? { hasFailedChildren: true } : {}),
    ...(prNumber ? { prNumber } : {}),
    ...(timing ? { timing } : {}),
    url: response.html_url || target.url,
  };
}

function toJobSnapshot(fallbackUrl: string, response: JobViewResponse): WatchSnapshot {
  const timing = compactTiming({
    queuedAt: response.created_at,
    startedAt: response.started_at ?? undefined,
    completedAt: response.completed_at ?? undefined,
  });

  return {
    status: requiredString(response.status, "job status"),
    conclusion: normalizeConclusion(response.conclusion),
    title: joinTitle(response.workflow_name, response.name),
    metadata: compactMetadata({
      workflowName: response.workflow_name,
      jobName: response.name,
      branchName: response.head_branch ?? response.headBranch ?? undefined,
    }),
    ...(timing ? { timing } : {}),
    url: response.html_url || fallbackUrl,
  };
}

function toPrSnapshot(target: PrWatchTarget, checks: PrCheckResponse[]): WatchSnapshot {
  const timing = compactTiming({
    startedAt: getEarliestTimestamp(checks.map((check) => check.startedAt ?? undefined)),
    completedAt: prChecksAreCompleted(checks)
      ? getLatestTimestamp(checks.map((check) => check.completedAt ?? undefined))
      : undefined,
  });
  const state = getPrChecksState(checks);

  return {
    ...state,
    title: `Pull request #${target.prNumber}`,
    prNumber: target.prNumber,
    ...(timing ? { timing } : {}),
    url: target.url,
  };
}

function getPrChecksState(checks: PrCheckResponse[]): WatchState {
  const buckets = checks.map((check) => check.bucket?.trim()).filter((bucket): bucket is string => Boolean(bucket));

  if (buckets.length === 0) {
    return { status: "pending", conclusion: null };
  }

  if (buckets.includes("pending")) {
    return {
      status: "in_progress",
      conclusion: null,
      ...(buckets.includes("fail") ? { hasFailedChildren: true } : {}),
    };
  }

  if (buckets.includes("fail")) {
    return { status: "completed", conclusion: "failure" };
  }

  if (buckets.includes("cancel")) {
    return { status: "completed", conclusion: "cancelled" };
  }

  if (buckets.every((bucket) => bucket === "skipping")) {
    return { status: "completed", conclusion: "skipped" };
  }

  if (buckets.every((bucket) => bucket === "pass" || bucket === "skipping")) {
    return { status: "completed", conclusion: "success" };
  }

  return { status: "pending", conclusion: null };
}

function prChecksAreCompleted(checks: PrCheckResponse[]): boolean {
  return checks.length > 0 && !checks.some((check) => check.bucket?.trim() === "pending");
}

function getEarliestTimestamp(values: Array<string | undefined>): string | undefined {
  return getExtremeTimestamp(values, Math.min);
}

function getLatestTimestamp(values: Array<string | undefined>): string | undefined {
  return getExtremeTimestamp(values, Math.max);
}

function getExtremeTimestamp(
  values: Array<string | undefined>,
  select: (...values: number[]) => number,
): string | undefined {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);

  if (timestamps.length === 0) {
    return undefined;
  }

  return new Date(select(...timestamps)).toISOString();
}

function compactMetadata(metadata: WatchMetadata): WatchMetadata | undefined {
  const entries = Object.entries(metadata)
    .map(([key, value]) => [key, value?.trim()] as const)
    .filter((entry): entry is [keyof WatchMetadata, string] => {
      const value = entry[1];
      return typeof value === "string" && value.length > 0;
    });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function compactTiming(timing: WatchTiming): WatchTiming | undefined {
  const entries = Object.entries(timing).filter((entry): entry is [keyof WatchTiming, string] => {
    const value = entry[1];
    return typeof value === "string" && value.length > 0;
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function joinTitle(prefix: string | undefined, title: string | undefined): string {
  const cleanPrefix = prefix?.trim();
  const cleanTitle = title?.trim();

  if (cleanPrefix && cleanTitle) {
    if (cleanPrefix.toLocaleLowerCase() === cleanTitle.toLocaleLowerCase()) {
      return cleanTitle;
    }

    return `${cleanPrefix}: ${cleanTitle}`;
  }

  return cleanTitle || cleanPrefix || "GitHub Actions";
}

function getPullRequestNumber(
  pullRequests: PullRequestReference[] | undefined,
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
): string | undefined {
  const reference = pullRequests?.find((pullRequest) =>
    pullRequestReferenceMatchesRepository(pullRequest, target));
  const number = reference?.number;

  if (typeof number === "number" && Number.isInteger(number) && number > 0) {
    return String(number);
  }

  if (typeof number === "string" && /^[1-9]\d*$/.test(number)) {
    return number;
  }

  return undefined;
}

function pullRequestReferenceMatchesRepository(
  pullRequest: PullRequestReference,
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
): boolean {
  const repository = pullRequest.base?.repo;
  const expectedName = `${target.owner}/${target.repo}`.toLowerCase();

  if (repository?.full_name?.trim().toLowerCase() === expectedName) {
    return true;
  }

  if (!repository?.url) {
    return false;
  }

  try {
    return new URL(repository.url).pathname.replace(/^\/repos\//, "").replace(/\/$/, "").toLowerCase() === expectedName;
  } catch {
    return false;
  }
}

function createPullRequestDetailsQuery(targets: PrWatchTarget[]): { args: string[] } {
  const variableDefinitions: string[] = [];
  const selections: string[] = [];
  const args = ["api", "graphql"];

  targets.forEach((target, index) => {
    if (!/^[1-9]\d*$/.test(target.prNumber)) {
      throw new Error("Pull request details need a positive pull request number.");
    }

    variableDefinitions.push(`$owner${index}: String!`, `$repo${index}: String!`, `$number${index}: Int!`);
    selections.push(
      `repository${index}: repository(owner: $owner${index}, name: $repo${index}) { ` +
        `pullRequest(number: $number${index}) { title state isDraft headRefName author { login } } }`,
    );
  });

  args.push("-f", `query=query(${variableDefinitions.join(", ")}) { ${selections.join(" ")} }`);

  targets.forEach((target, index) => {
    args.push(
      "-f",
      `owner${index}=${target.owner}`,
      "-f",
      `repo${index}=${target.repo}`,
      "-F",
      `number${index}=${target.prNumber}`,
    );
  });

  return { args };
}

function normalizePullRequestDetails(
  response: PullRequestDetailsResponse | null | undefined,
): PullRequestDetails | undefined {
  if (!response) {
    return undefined;
  }

  try {
    const branchName = response.headRefName?.trim();

    return {
      ...(response.author?.login?.trim() ? { authorLogin: response.author.login.trim() } : {}),
      ...(branchName ? { branchName } : {}),
      state: getPullRequestState(response),
      title: requiredString(response.title?.trim(), "pull request title"),
    };
  } catch {
    return undefined;
  }
}

function getPullRequestState(response: PullRequestDetailsResponse): PrSourceState {
  const state = response.state?.trim().toUpperCase();

  if (state === "MERGED") {
    return "merged";
  }

  if (state === "CLOSED") {
    return "closed";
  }

  if (state === "OPEN") {
    return response.isDraft === true ? "draft" : "ready";
  }

  throw new Error("gh returned a response without pull request state.");
}

function normalizeConclusion(conclusion: string | null | undefined): string | null {
  return conclusion ? conclusion : null;
}

function isFailureConclusion(conclusion: string | null | undefined): boolean {
  return Boolean(conclusion && conclusion !== "success" && conclusion !== "cancelled" && conclusion !== "skipped");
}

function requiredString(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`gh returned a response without ${label}.`);
  }

  return value;
}

function parseJson<T>(stdout: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error("gh returned invalid JSON.");
  }
}

async function fetchConditionalApiJson<T>(executor: ShellExecutor, args: string[]): Promise<T> {
  let cache = conditionalApiCaches.get(executor);

  if (!cache) {
    cache = new Map();
    conditionalApiCaches.set(executor, cache);
  }

  const key = JSON.stringify(args);
  const cached = cache.get(key);

  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
  }

  const result = await executor.execute("gh", [
    "api",
    "--include",
    ...(cached ? ["-H", `If-None-Match: ${cached.etag}`] : []),
    ...args,
  ]);
  const response = parseIncludedGhResponse(result.stdout);

  if (response?.status === 304) {
    if (!cached) {
      throw new Error("gh returned 304 Not Modified without a cached response.");
    }

    return parseJson<T>(cached.body);
  }

  assertSuccessfulGhResult(result);

  if (!response) {
    return parseJson<T>(result.stdout);
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GitHub returned HTTP ${response.status}.`);
  }

  if (response.etag) {
    if (!cache.has(key) && cache.size >= conditionalApiCacheLimit) {
      const oldestKey = cache.keys().next().value;

      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }

    cache.set(key, { body: response.body, etag: response.etag });
  } else {
    cache.delete(key);
  }

  return parseJson<T>(response.body);
}

function parseIncludedGhResponse(stdout: string): {
  body: string;
  etag?: string;
  status: number;
} | undefined {
  const statusMatch = stdout.match(/^HTTP\/\S+\s+(\d{3})\b/);

  if (!statusMatch) {
    return undefined;
  }

  const crlfEnd = stdout.indexOf("\r\n\r\n");
  const lfEnd = stdout.indexOf("\n\n");
  const headerEnd = crlfEnd >= 0 ? crlfEnd : lfEnd;

  if (headerEnd < 0) {
    throw new Error("gh returned HTTP headers without a response separator.");
  }

  const separatorLength = crlfEnd >= 0 ? 4 : 2;
  const headers = stdout.slice(0, headerEnd);
  const etag = headers.match(/^etag:\s*(.+)\r?$/im)?.[1]?.trim();

  return {
    body: stdout.slice(headerEnd + separatorLength),
    ...(etag ? { etag } : {}),
    status: Number(statusMatch[1]),
  };
}

function assertSuccessfulGhResult(result: ShellResult, additionalSuccessCodes: number[] = []): void {
  if (result.code === 0 || additionalSuccessCodes.includes(result.code)) {
    return;
  }

  throw new Error(result.stderr || result.stdout || `gh exited with status ${result.code}.`);
}

function normalizeGhError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("program not found") ||
    lowerMessage.includes("no such file") ||
    lowerMessage.includes("enoent")
  ) {
    return new Error("gh CLI was not found. Install GitHub CLI and try again.");
  }

  if (
    lowerMessage.includes("gh auth login") ||
    lowerMessage.includes("authentication") ||
    lowerMessage.includes("not authenticated") ||
    lowerMessage.includes("bad credentials")
  ) {
    return new Error("gh is not authenticated. Run `gh auth login` and try again.");
  }

  return error instanceof Error ? error : new Error(message);
}

function isMissingProgramError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("program not found") ||
    lowerMessage.includes("not found") ||
    lowerMessage.includes("no such file") ||
    lowerMessage.includes("enoent")
  );
}
