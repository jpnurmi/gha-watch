import type { ParsedWatchTarget } from "../domain/githubUrl";
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
  timing?: WatchTiming;
  url: string;
};

type RunViewResponse = {
  status?: string;
  conclusion?: string | null;
  createdAt?: string;
  displayTitle?: string;
  startedAt?: string;
  updatedAt?: string;
  workflowName?: string;
  url?: string;
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

export async function fetchWatchState(
  target: ParsedWatchTarget,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<WatchSnapshot> {
  try {
    if (target.kind === "run") {
      const result = await executor.execute("gh", [
        "run",
        "view",
        target.runId,
        "-R",
        `${target.owner}/${target.repo}`,
        "--json",
        "status,conclusion,url,workflowName,displayTitle,createdAt,startedAt,updatedAt",
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

export async function rerunFailedWatch(
  target: ParsedWatchTarget,
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
      const commands = program === "gh" ? ["gh", "gh-homebrew", "gh-usrlocal"] : [program];
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
    queuedAt: response.createdAt,
    startedAt: response.startedAt,
    completedAt: status === "completed" ? response.updatedAt : undefined,
  });

  return {
    status,
    conclusion: normalizeConclusion(response.conclusion),
    title: joinTitle(response.workflowName, response.displayTitle),
    ...(timing ? { timing } : {}),
    url: response.url || fallbackUrl,
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
