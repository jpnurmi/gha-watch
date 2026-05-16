import { describe, expect, it } from "vitest";
import { fetchRepositoryIconUrl, fetchWatchState, rerunFailedWatch, type ShellExecutor } from "./gh";

function createExecutor(result: Awaited<ReturnType<ShellExecutor["execute"]>>): {
  executor: ShellExecutor;
  calls: Array<{ program: string; args: string[] }>;
} {
  const calls: Array<{ program: string; args: string[] }> = [];

  return {
    calls,
    executor: {
      async execute(program, args) {
        calls.push({ program, args });
        return result;
      },
    },
  };
}

describe("fetchWatchState", () => {
  it("fetches run state via gh run view", async () => {
    const { executor, calls } = createExecutor({
      code: 0,
      stdout: JSON.stringify({
        status: "in_progress",
        conclusion: "",
        displayTitle: "Run tests",
        workflowName: "CI",
        createdAt: "2026-05-16T12:00:00Z",
        startedAt: "2026-05-16T12:02:00Z",
        updatedAt: "2026-05-16T12:03:00Z",
        url: "https://github.com/getsentry/sentry/actions/runs/123",
      }),
      stderr: "",
    });

    await expect(
      fetchWatchState(
        {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          url: "https://github.com/getsentry/sentry/actions/runs/123",
        },
        executor,
      ),
    ).resolves.toEqual({
      status: "in_progress",
      conclusion: null,
      title: "CI: Run tests",
      timing: {
        queuedAt: "2026-05-16T12:00:00Z",
        startedAt: "2026-05-16T12:02:00Z",
      },
      url: "https://github.com/getsentry/sentry/actions/runs/123",
    });

    expect(calls).toEqual([
      {
        program: "gh",
        args: [
          "run",
          "view",
          "123",
          "-R",
          "getsentry/sentry",
          "--json",
          "status,conclusion,url,workflowName,displayTitle,createdAt,startedAt,updatedAt",
        ],
      },
    ]);
  });

  it("fetches job state via gh api", async () => {
    const { executor, calls } = createExecutor({
      code: 0,
      stdout: JSON.stringify({
        status: "completed",
        conclusion: "failure",
        name: "test (macos)",
        workflow_name: "CI",
        created_at: "2026-05-16T12:00:00Z",
        started_at: "2026-05-16T12:02:00Z",
        completed_at: "2026-05-16T12:09:00Z",
        html_url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
      }),
      stderr: "",
    });

    await expect(
      fetchWatchState(
        {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          jobId: "456",
          url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
        },
        executor,
      ),
    ).resolves.toEqual({
      status: "completed",
      conclusion: "failure",
      title: "CI: test (macos)",
      timing: {
        queuedAt: "2026-05-16T12:00:00Z",
        startedAt: "2026-05-16T12:02:00Z",
        completedAt: "2026-05-16T12:09:00Z",
      },
      url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
    });

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["api", "repos/getsentry/sentry/actions/jobs/456"],
      },
    ]);
  });

  it("does not duplicate matching workflow and run titles", async () => {
    const { executor } = createExecutor({
      code: 0,
      stdout: JSON.stringify({
        status: "in_progress",
        conclusion: "",
        displayTitle: "CI",
        workflowName: "CI",
        url: "https://github.com/jpnurmi/sentry-qml/actions/runs/123",
      }),
      stderr: "",
    });

    await expect(
      fetchWatchState(
        {
          kind: "run",
          owner: "jpnurmi",
          repo: "sentry-qml",
          runId: "123",
          url: "https://github.com/jpnurmi/sentry-qml/actions/runs/123",
        },
        executor,
      ),
    ).resolves.toMatchObject({
      title: "CI",
    });
  });

  it("maps missing gh failures to a dependency error", async () => {
    const executor: ShellExecutor = {
      async execute() {
        throw new Error("program not found");
      },
    };

    await expect(
      fetchWatchState(
        {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          url: "https://github.com/getsentry/sentry/actions/runs/123",
        },
        executor,
      ),
    ).rejects.toThrow("gh CLI was not found. Install GitHub CLI and try again.");
  });

  it("maps gh auth failures to an auth error", async () => {
    const { executor } = createExecutor({
      code: 4,
      stdout: "",
      stderr: "To get started with GitHub CLI, run: gh auth login",
    });

    await expect(
      fetchWatchState(
        {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          url: "https://github.com/getsentry/sentry/actions/runs/123",
        },
        executor,
      ),
    ).rejects.toThrow("gh is not authenticated. Run `gh auth login` and try again.");
  });
});

describe("fetchRepositoryIconUrl", () => {
  it("fetches the repository owner avatar URL via gh api", async () => {
    const { executor, calls } = createExecutor({
      code: 0,
      stdout: JSON.stringify({
        owner: {
          avatar_url: "https://avatars.githubusercontent.com/u/1396951?v=4",
        },
      }),
      stderr: "",
    });

    await expect(
      fetchRepositoryIconUrl(
        {
          owner: "getsentry",
          repo: "sentry-native",
        },
        executor,
      ),
    ).resolves.toBe("https://avatars.githubusercontent.com/u/1396951?v=4");

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["api", "repos/getsentry/sentry-native"],
      },
    ]);
  });
});

describe("rerunFailedWatch", () => {
  it("reruns only failed jobs for a run watch", async () => {
    const { executor, calls } = createExecutor({ code: 0, stdout: "", stderr: "" });

    await rerunFailedWatch(
      {
        kind: "run",
        owner: "getsentry",
        repo: "sentry",
        runId: "123",
        url: "https://github.com/getsentry/sentry/actions/runs/123",
      },
      executor,
    );

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["run", "rerun", "123", "--failed", "-R", "getsentry/sentry"],
      },
    ]);
  });

  it("reruns failed jobs for a job watch when the run id is known", async () => {
    const { executor, calls } = createExecutor({ code: 0, stdout: "", stderr: "" });

    await rerunFailedWatch(
      {
        kind: "job",
        owner: "getsentry",
        repo: "sentry",
        runId: "123",
        jobId: "456",
        url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
      },
      executor,
    );

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["run", "rerun", "123", "--failed", "-R", "getsentry/sentry"],
      },
    ]);
  });

  it("rejects job watches without a run id", async () => {
    const { executor, calls } = createExecutor({ code: 0, stdout: "", stderr: "" });

    await expect(
      rerunFailedWatch(
        {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          jobId: "456",
          url: "https://github.com/getsentry/sentry/runs/456",
        },
        executor,
      ),
    ).rejects.toThrow("This job link does not include a workflow run id.");

    expect(calls).toEqual([]);
  });
});
