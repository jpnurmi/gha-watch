import { type ActiveWorkflowRun, type AuthoredOpenPullRequest, type OpenPullRequest, type PullRequestDetails, type RepositoryCiStatus, type RepositoryCiStatusTone, type RepositoryCiWorkflowStatus, type RerunMode, type WatchSnapshot, type WorkflowDefinition, type WorkflowRunPullRequest, type WorkflowRunSummary } from "../../app/githubPort";
import { type ParsedWatchTarget, type PrWatchTarget, type WatchTarget } from "../../domain/githubUrl";
import { type WatchState } from "../../domain/status";
import { type PrSourceState, type WatchMetadata, type WatchTiming } from "../../domain/watches";
import { requiredString } from "../ghProtocol";
import { type JobViewResponse, type PrCheckResponse, type PullRequestCheckResponse, type PullRequestDetailsResponse, type PullRequestListResponse, type PullRequestReference, type PullRequestSearchResponse, type RunJobsResponse, type RunViewResponse, type WorkflowListResponse, type WorkflowRunApiResponse, type WorkflowRunListResponse, type WorkflowRunPullRequestResponse } from "./responses";

export const workflowRunsPerPage = 100;

export function normalizeActiveWorkflowRun(response: WorkflowRunListResponse): ActiveWorkflowRun | undefined {
  const runId = getRunDatabaseId(response.databaseId);
  const runNumber = getRunDatabaseId(response.number);
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
    ...(runNumber ? { runNumber } : {}),
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

export function normalizeWorkflowRunSummary(
  response: WorkflowRunApiResponse,
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
): WorkflowRunSummary | undefined {
  const runId = getRunDatabaseId(response.id);
  const runNumber = getRunDatabaseId(response.run_number);
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
    ...(runNumber ? { runNumber } : {}),
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

export function compareWorkflowRunsByUpdatedAt(left: ActiveWorkflowRun, right: ActiveWorkflowRun): number {
  return getSortTimestamp(right.updatedAt ?? right.createdAt) - getSortTimestamp(left.updatedAt ?? left.createdAt);
}

export function normalizeOpenPullRequest(
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

export function normalizeAuthoredOpenPullRequest(
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

export function normalizeWorkflowDefinition(response: WorkflowListResponse): WorkflowDefinition | undefined {
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

export function dedupeWorkflowDefinitionNames(): (workflow: WorkflowDefinition) => boolean {
  const seen = new Set<string>();

  return (workflow) => {
    if (seen.has(workflow.name)) {
      return false;
    }

    seen.add(workflow.name);
    return true;
  };
}

export function compareWorkflowDefinitionsByName(left: WorkflowDefinition, right: WorkflowDefinition): number {
  return left.name.localeCompare(right.name);
}

export function summarizeRepositoryCiStatus(
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

export function normalizeRepositoryCiWorkflowRun(response: WorkflowRunApiResponse): WorkflowRunListResponse {
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

export function comparePullRequestsByUpdatedAt(left: OpenPullRequest, right: OpenPullRequest): number {
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

export function getRerunArgs(
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

export function getPullRequestRunIds(
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

export function shouldFetchRunJobs(response: RunViewResponse): boolean {
  return response.status === "in_progress" && Boolean(response.jobs_url);
}

export function runJobsHaveFailures(response: RunJobsResponse): boolean {
  return Boolean(response.jobs?.some((job) => job.status === "completed" && isFailureConclusion(job.conclusion)));
}

export function toRunSnapshot(
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
      runNumber: getRunDatabaseId(response.run_number),
      branchName: response.head_branch ?? undefined,
      commitSha: response.head_sha ?? undefined,
    }),
    ...(failedChildren ? { hasFailedChildren: true } : {}),
    ...(prNumber ? { prNumber } : {}),
    ...(timing ? { timing } : {}),
    url: response.html_url || target.url,
  };
}

export function toJobSnapshot(fallbackUrl: string, response: JobViewResponse): WatchSnapshot {
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

export function toPrSnapshot(target: PrWatchTarget, checks: PrCheckResponse[]): WatchSnapshot {
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

export function createPullRequestDetailsQuery(targets: PrWatchTarget[]): { args: string[] } {
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

export function normalizePullRequestDetails(
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
