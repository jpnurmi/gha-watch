import type {
  CheckWatchTarget,
  ParsedWatchTarget,
  PrWatchTarget,
  WatchTarget,
} from "../domain/githubUrl";
import type { WatchState } from "../domain/status";
import type { WatchMetadata, WatchTiming } from "../domain/watches";

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
  name?: string;
  pull_requests?: PullRequestReference[];
  run_started_at?: string;
  updated_at?: string;
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

type RepositoryViewResponse = {
  owner?: {
    avatar_url?: string;
  };
};

type UserViewResponse = {
  login?: string;
};

export type OpenPullRequest = {
  number: string;
  title: string;
  isDraft: boolean;
  updatedAt?: string;
  url: string;
};

export type ActiveWorkflowRun = {
  runId: string;
  title: string;
  status: string;
  branchName?: string;
  createdAt?: string;
  updatedAt?: string;
  url: string;
};

type PullRequestListResponse = {
  isDraft?: boolean;
  number?: number | string;
  title?: string;
  updatedAt?: string;
  url?: string;
};

type WorkflowRunListResponse = {
  createdAt?: string;
  databaseId?: number | string;
  displayTitle?: string;
  headBranch?: string | null;
  status?: string;
  updatedAt?: string;
  url?: string;
  workflowName?: string;
};

type PullRequestReference = {
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
      return toRunSnapshot(target.url, parseJson<RunViewResponse>(result.stdout));
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
      "20",
      "--json",
      "number,title,isDraft,updatedAt,url",
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

export async function fetchActiveWorkflowRuns(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  executor: ShellExecutor = createTauriShellExecutor(),
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
          "--json",
          "databaseId,displayTitle,workflowName,headBranch,status,createdAt,updatedAt,url",
        ]);

        assertSuccessfulGhResult(result);
        return parseJson<WorkflowRunListResponse[]>(result.stdout);
      }),
    );

    return results
      .flat()
      .map(normalizeActiveWorkflowRun)
      .filter((run): run is ActiveWorkflowRun => Boolean(run))
      .sort(compareWorkflowRunsByUpdatedAt);
  } catch (error) {
    throw normalizeGhError(error);
  }
}

function normalizeActiveWorkflowRun(response: WorkflowRunListResponse): ActiveWorkflowRun | undefined {
  const runId = getRunDatabaseId(response.databaseId);
  const title = joinTitle(response.workflowName, response.displayTitle);
  const status = response.status?.trim();
  const url = response.url?.trim();

  if (!runId || !status || !url || title === "GitHub Actions") {
    return undefined;
  }

  const branchName = response.headBranch?.trim();

  return {
    runId,
    title,
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
    ...(response.updatedAt ? { updatedAt: response.updatedAt } : {}),
    url,
  };
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

function toRunSnapshot(fallbackUrl: string, response: RunViewResponse): WatchSnapshot {
  const status = requiredString(response.status, "run status");
  const timing = compactTiming({
    queuedAt: response.created_at,
    startedAt: response.run_started_at,
    completedAt: status === "completed" ? response.updated_at : undefined,
  });
  const prNumber = getPullRequestNumber(response.pull_requests);

  return {
    status,
    conclusion: normalizeConclusion(response.conclusion),
    title: joinTitle(response.name, response.display_title),
    metadata: compactMetadata({
      workflowName: response.name,
      runTitle: response.display_title,
      branchName: response.head_branch ?? undefined,
    }),
    ...(prNumber ? { prNumber } : {}),
    ...(timing ? { timing } : {}),
    url: response.html_url || fallbackUrl,
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
    metadata: {
      prTitle: `Pull request #${target.prNumber}`,
    },
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

  if (buckets.includes("fail")) {
    return { status: "completed", conclusion: "failure" };
  }

  if (buckets.includes("cancel")) {
    return { status: "completed", conclusion: "cancelled" };
  }

  if (buckets.includes("pending")) {
    return { status: "in_progress", conclusion: null };
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
    .filter((timestamp) => Number.isFinite(timestamp));

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

function getPullRequestNumber(pullRequests: PullRequestReference[] | undefined): string | undefined {
  const number = pullRequests?.[0]?.number;

  if (typeof number === "number" && Number.isInteger(number) && number > 0) {
    return String(number);
  }

  if (typeof number === "string" && /^[1-9]\d*$/.test(number)) {
    return number;
  }

  return undefined;
}

function normalizeConclusion(conclusion: string | null | undefined): string | null {
  return conclusion ? conclusion : null;
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
