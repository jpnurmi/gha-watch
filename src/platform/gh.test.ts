import { describe, expect, it } from "vitest";
import {
  fetchAuthenticatedUserLogin,
  fetchRepositoryIconUrl,
  fetchWatchState,
  rerunFailedWatch,
  resolvePrWatchTargets,
  type ShellExecutor,
} from "./gh";

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

function createSequenceExecutor(results: Array<Awaited<ReturnType<ShellExecutor["execute"]>>>): {
  executor: ShellExecutor;
  calls: Array<{ program: string; args: string[] }>;
} {
  const calls: Array<{ program: string; args: string[] }> = [];

  return {
    calls,
    executor: {
      async execute(program, args) {
        calls.push({ program, args });
        const result = results.shift();

        if (!result) {
          throw new Error("No fake result queued.");
        }

        return result;
      },
    },
  };
}

describe("fetchWatchState", () => {
  it("fetches run state and pull request references via gh api", async () => {
    const { executor, calls } = createExecutor({
      code: 0,
      stdout: JSON.stringify({
        status: "in_progress",
        conclusion: "",
        display_title: "Run tests",
        name: "CI",
        created_at: "2026-05-16T12:00:00Z",
        run_started_at: "2026-05-16T12:02:00Z",
        updated_at: "2026-05-16T12:03:00Z",
        html_url: "https://github.com/getsentry/sentry/actions/runs/123",
        pull_requests: [{ number: 51 }],
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
      prNumber: "51",
      timing: {
        queuedAt: "2026-05-16T12:00:00Z",
        startedAt: "2026-05-16T12:02:00Z",
      },
      url: "https://github.com/getsentry/sentry/actions/runs/123",
    });

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["api", "repos/getsentry/sentry/actions/runs/123"],
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
        display_title: "CI",
        name: "CI",
        html_url: "https://github.com/jpnurmi/sentry-qml/actions/runs/123",
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

describe("fetchAuthenticatedUserLogin", () => {
  it("fetches the authenticated GitHub user login via gh api", async () => {
    const { executor, calls } = createExecutor({
      code: 0,
      stdout: JSON.stringify({
        login: "jpnurmi",
      }),
      stderr: "",
    });

    await expect(fetchAuthenticatedUserLogin(executor)).resolves.toBe("jpnurmi");

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["api", "user"],
      },
    ]);
  });
});

describe("resolvePrWatchTargets", () => {
  it("resolves current pull request runs by head SHA", async () => {
    const { executor, calls } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify({
          headRefName: "ci/ios",
          headRefOid: "abc123",
          isDraft: false,
          mergedAt: null,
          state: "OPEN",
        }),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify([
          {
            databaseId: 101,
            event: "pull_request",
            headSha: "abc123",
            url: "https://github.com/jpnurmi/sentry-qml/actions/runs/101",
          },
          {
            databaseId: 102,
            event: "pull_request",
            headSha: "abc123",
            url: "https://github.com/jpnurmi/sentry-qml/actions/runs/102",
          },
          {
            databaseId: 99,
            event: "pull_request",
            headSha: "old",
            url: "https://github.com/jpnurmi/sentry-qml/actions/runs/99",
          },
        ]),
        stderr: "",
      },
    ]);

    await expect(
      resolvePrWatchTargets(
        {
          kind: "pr",
          owner: "jpnurmi",
          repo: "sentry-qml",
          prNumber: "51",
          url: "https://github.com/jpnurmi/sentry-qml/pull/51",
        },
        executor,
      ),
    ).resolves.toEqual({
      sourceState: "ready",
      targets: [
        {
          kind: "run",
          owner: "jpnurmi",
          repo: "sentry-qml",
          runId: "101",
          prNumber: "51",
          url: "https://github.com/jpnurmi/sentry-qml/actions/runs/101",
        },
        {
          kind: "run",
          owner: "jpnurmi",
          repo: "sentry-qml",
          runId: "102",
          prNumber: "51",
          url: "https://github.com/jpnurmi/sentry-qml/actions/runs/102",
        },
      ],
    });

    expect(calls).toEqual([
      {
        program: "gh",
        args: [
          "pr",
          "view",
          "51",
          "-R",
          "jpnurmi/sentry-qml",
          "--json",
          "headRefName,headRefOid,isDraft,mergedAt,state",
        ],
      },
      {
        program: "gh",
        args: [
          "run",
          "list",
          "-R",
          "jpnurmi/sentry-qml",
          "--event",
          "pull_request",
          "--branch",
          "ci/ios",
          "--limit",
          "50",
          "--json",
          "databaseId,event,headSha,url",
        ],
      },
    ]);
  });

  it("resolves draft pull request runs with a draft source state", async () => {
    const { executor } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify({
          headRefName: "ci/ios",
          headRefOid: "abc123",
          isDraft: true,
          mergedAt: null,
          state: "OPEN",
        }),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify([
          {
            databaseId: 101,
            event: "pull_request",
            headSha: "abc123",
            url: "https://github.com/jpnurmi/sentry-qml/actions/runs/101",
          },
        ]),
        stderr: "",
      },
    ]);

    await expect(
      resolvePrWatchTargets(
        {
          kind: "pr",
          owner: "jpnurmi",
          repo: "sentry-qml",
          prNumber: "51",
          url: "https://github.com/jpnurmi/sentry-qml/pull/51",
        },
        executor,
      ),
    ).resolves.toMatchObject({
      sourceState: "draft",
      targets: [
        {
          runId: "101",
        },
      ],
    });
  });

  it.each([
    ["merged", { mergedAt: "2026-05-17T10:15:00Z", state: "MERGED" }],
    ["closed", { mergedAt: null, state: "CLOSED" }],
  ] as const)("resolves %s pull requests without fetching workflow runs", async (sourceState, prResponse) => {
    const { executor, calls } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify(prResponse),
        stderr: "",
      },
    ]);

    await expect(
      resolvePrWatchTargets(
        {
          kind: "pr",
          owner: "jpnurmi",
          repo: "sentry-qml",
          prNumber: "51",
          url: "https://github.com/jpnurmi/sentry-qml/pull/51",
        },
        executor,
      ),
    ).resolves.toEqual({
      sourceState,
      targets: [],
    });

    expect(calls).toEqual([
      {
        program: "gh",
        args: [
          "pr",
          "view",
          "51",
          "-R",
          "jpnurmi/sentry-qml",
          "--json",
          "headRefName,headRefOid,isDraft,mergedAt,state",
        ],
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
