import type {
  CheckWatchTarget,
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
  startedAt?: string | null;
};

type PullRequestDetailsResponse = {
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
  updatedAt?: string;
  url: string;
};

export type PullRequestDetails = {
  branchName?: string;
  state: PrSourceState;
  title: string;
};

export type PullRequestDetailsBatch = Array<PullRequestDetails | undefined>;

export type ActiveWorkflowRun = {
  runId: string;
  title: string;
  event?: string;
  workflowName?: string;
  status: string;
  branchName?: string;
  createdAt?: string;
  updatedAt?: string;
  url: string;
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

type WorkflowListResponse = {
  name?: string;
  path?: string;
  state?: string;
};

type PullRequestReference = {
  base?: {
    repo?: {
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
      const result = await executor.execute("gh", [
        "api",
        `repos/${target.owner}/${target.repo}/actions/runs/${target.runId}`,
      ]);

      assertSuccessfulGhResult(result);
      const response = parseJson<RunViewResponse>(result.stdout);
      const failedChildren = shouldFetchRunJobs(response)
        ? await fetchRunFailedChildren(target, executor)
        : undefined;

      return toRunSnapshot(target, response, failedChildren);
    }

    const result = await executor.execute("gh", [
      "api",
      `repos/${target.owner}/${target.repo}/actions/jobs/${target.jobId}`,
    ]);

    assertSuccessfulGhResult(result);
    return toJobSnapshot(target.url, parseJson<JobViewResponse>(result.stdout));
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

export async function fetchRepositoryDefaultBranchCiStatus(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  options: RepositoryCiStatusOptions = {},
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<RepositoryCiStatus> {
  try {
    const defaultBranch = options.defaultBranch ?? await fetchRepositoryDefaultBranch(target, executor);
    const commitResult = await executor.execute("gh", [
      "api",
      `repos/${target.owner}/${target.repo}/commits/${encodeURIComponent(defaultBranch)}`,
    ]);
    assertSuccessfulGhResult(commitResult);
    const commitSha = requiredString(parseJson<CommitViewResponse>(commitResult.stdout).sha, "default branch commit");
    const result = await executor.execute("gh", [
      "run",
      "list",
      "-R",
      `${target.owner}/${target.repo}`,
      "--branch",
      defaultBranch,
      "--commit",
      commitSha,
      "--event",
      "push",
      "--limit",
      "100",
      "--json",
      "databaseId,displayTitle,event,workflowDatabaseId,workflowName,headBranch,headSha,status,conclusion,createdAt,updatedAt,url",
    ]);

    assertSuccessfulGhResult(result);

    return summarizeRepositoryCiStatus(defaultBranch, commitSha, parseJson<WorkflowRunListResponse[]>(result.stdout));
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
  try {
    const result = await executor.execute("gh", [
      "pr",
      "list",
      "-R",
      `${target.owner}/${target.repo}`,
      "--state",
      "open",
      "--limit",
      "100",
      "--json",
      "number,title,isDraft,author,headRefName,updatedAt,url",
    ]);

    assertSuccessfulGhResult(result);

    return parseJson<PullRequestListResponse[]>(result.stdout)
      .map(normalizeOpenPullRequest)
      .filter((pullRequest): pullRequest is OpenPullRequest => Boolean(pullRequest))
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

function compareWorkflowRunsByUpdatedAt(left: ActiveWorkflowRun, right: ActiveWorkflowRun): number {
  return getSortTimestamp(right.updatedAt ?? right.createdAt) - getSortTimestamp(left.updatedAt ?? left.createdAt);
}

function normalizeOpenPullRequest(response: PullRequestListResponse): OpenPullRequest | undefined {
  const number = getPullRequestListNumber(response.number);
  const title = response.title?.trim();
  const url = response.url?.trim();

  if (!number || !title || !url) {
    return undefined;
  }

  return {
    number,
    title,
    isDraft: response.isDraft === true,
    ...(response.author?.login?.trim() ? { authorLogin: response.author.login.trim() } : {}),
    ...(response.headRefName?.trim() ? { headBranch: response.headRefName.trim() } : {}),
    ...(response.updatedAt ? { updatedAt: response.updatedAt } : {}),
    url,
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

export async function rerunFailedWatch(
  target: CheckWatchTarget,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<void> {
  const runId = target.kind === "run" ? target.runId : target.runId;

  if (!runId) {
    throw new Error("This job link does not include a workflow run id.");
  }

  try {
    assertSuccessfulGhResult(
      await executor.execute("gh", [
        "run",
        "rerun",
        runId,
        "--failed",
        "-R",
        `${target.owner}/${target.repo}`,
      ]),
    );
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export function createTauriShellExecutor(): ShellExecutor {
  return {
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
}

async function fetchRunFailedChildren(
  target: Extract<WatchTarget, { kind: "run" }>,
  executor: ShellExecutor,
): Promise<boolean> {
  const result = await executor.execute("gh", [
    "api",
    `repos/${target.owner}/${target.repo}/actions/runs/${target.runId}/jobs?per_page=100`,
  ]);

  assertSuccessfulGhResult(result);
  return runJobsHaveFailures(parseJson<RunJobsResponse>(result.stdout));
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
  const expectedPath = `/repos/${target.owner}/${target.repo}`.toLowerCase();
  const reference = pullRequests?.find((pullRequest) => {
    const repositoryUrl = pullRequest.base?.repo?.url;

    if (!repositoryUrl) {
      return false;
    }

    try {
      return new URL(repositoryUrl).pathname.replace(/\/$/, "").toLowerCase() === expectedPath;
    } catch {
      return false;
    }
  });
  const number = reference?.number;

  if (typeof number === "number" && Number.isInteger(number) && number > 0) {
    return String(number);
  }

  if (typeof number === "string" && /^[1-9]\d*$/.test(number)) {
    return number;
  }

  return undefined;
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
        `pullRequest(number: $number${index}) { title state isDraft headRefName } }`,
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
    lowerMessage.includes("not found") ||
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
