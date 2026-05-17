import type { CheckWatchTarget, ParsedWatchTarget, PrWatchTarget, RunWatchTarget } from "../domain/githubUrl";
import type { WatchState } from "../domain/status";
import type { WatchTiming } from "../domain/watches";

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
  prNumber?: string;
  timing?: WatchTiming;
  url: string;
};

type RunViewResponse = {
  status?: string;
  conclusion?: string | null;
  created_at?: string;
  display_title?: string;
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
  name?: string;
  started_at?: string | null;
  workflow_name?: string;
  html_url?: string;
};

type RepositoryViewResponse = {
  owner?: {
    avatar_url?: string;
  };
};

type PullRequestReference = {
  number?: number | string;
};

type PrViewResponse = {
  headRefName?: string;
  headRefOid?: string;
};

type RunListResponse = {
  databaseId?: number | string;
  event?: string;
  headSha?: string;
  url?: string;
};

export async function fetchWatchState(
  target: CheckWatchTarget,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<WatchSnapshot> {
  try {
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

export async function resolvePrWatchTargets(
  target: PrWatchTarget,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<CheckWatchTarget[]> {
  try {
    const prResult = await executor.execute("gh", [
      "pr",
      "view",
      target.prNumber,
      "-R",
      `${target.owner}/${target.repo}`,
      "--json",
      "headRefName,headRefOid",
    ]);
    assertSuccessfulGhResult(prResult);

    const pr = parseJson<PrViewResponse>(prResult.stdout);
    const headRefName = requiredString(pr.headRefName, "pull request head branch");
    const headRefOid = requiredString(pr.headRefOid, "pull request head SHA");
    const runsResult = await executor.execute("gh", [
      "run",
      "list",
      "-R",
      `${target.owner}/${target.repo}`,
      "--event",
      "pull_request",
      "--branch",
      headRefName,
      "--limit",
      "50",
      "--json",
      "databaseId,event,headSha,url",
    ]);
    assertSuccessfulGhResult(runsResult);

    return parseJson<RunListResponse[]>(runsResult.stdout)
      .filter((run) => run.event === "pull_request" && run.headSha === headRefOid)
      .map((run) => toPrRunTarget(target, run))
      .filter((run): run is RunWatchTarget => Boolean(run));
  } catch (error) {
    throw normalizeGhError(error);
  }
}

function toPrRunTarget(source: PrWatchTarget, run: RunListResponse): RunWatchTarget | undefined {
  const runId = getRunDatabaseId(run.databaseId);

  if (!runId) {
    return undefined;
  }

  return {
    kind: "run",
    owner: source.owner,
    repo: source.repo,
    runId,
    prNumber: source.prNumber,
    url: run.url || `https://github.com/${source.owner}/${source.repo}/actions/runs/${runId}`,
  };
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
    ...(timing ? { timing } : {}),
    url: response.html_url || fallbackUrl,
  };
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

function assertSuccessfulGhResult(result: ShellResult): void {
  if (result.code === 0) {
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
