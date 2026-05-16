import type { ParsedWatchTarget } from "../domain/githubUrl";
import type { WatchState } from "../domain/status";

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
  url: string;
};

type RunViewResponse = {
  status?: string;
  conclusion?: string | null;
  displayTitle?: string;
  workflowName?: string;
  url?: string;
};

type JobViewResponse = {
  status?: string;
  conclusion?: string | null;
  name?: string;
  workflow_name?: string;
  html_url?: string;
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
        "status,conclusion,url,workflowName,displayTitle",
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

export function createTauriShellExecutor(): ShellExecutor {
  return {
    async execute(program, args) {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const output = await Command.create(program, args).execute();

      return {
        code: output.code ?? 1,
        stdout: output.stdout,
        stderr: output.stderr,
      };
    },
  };
}

function toRunSnapshot(fallbackUrl: string, response: RunViewResponse): WatchSnapshot {
  return {
    status: requiredString(response.status, "run status"),
    conclusion: normalizeConclusion(response.conclusion),
    title: joinTitle(response.workflowName, response.displayTitle),
    url: response.url || fallbackUrl,
  };
}

function toJobSnapshot(fallbackUrl: string, response: JobViewResponse): WatchSnapshot {
  return {
    status: requiredString(response.status, "job status"),
    conclusion: normalizeConclusion(response.conclusion),
    title: joinTitle(response.workflow_name, response.name),
    url: response.html_url || fallbackUrl,
  };
}

function joinTitle(prefix: string | undefined, title: string | undefined): string {
  if (prefix && title) {
    return `${prefix}: ${title}`;
  }

  return title || prefix || "GitHub Actions";
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
