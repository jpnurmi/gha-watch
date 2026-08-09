import { describe, expect, it } from "vitest";
import {
  fetchActiveWorkflowRuns,
  fetchAuthenticatedUserLogin,
  fetchOpenPullRequests,
  fetchRateLimit,
  fetchRepositoryDefaultBranchCiStatus,
  fetchRepositoryDefaultBranch,
  fetchRepositoryIconUrl,
  fetchUserActiveWorkflowRuns,
  fetchWatchState,
  fetchWorkflowDefinitions,
  rerunFailedWatch,
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
        head_branch: "feature/build-status",
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
      metadata: {
        workflowName: "CI",
        runTitle: "Run tests",
        branchName: "feature/build-status",
      },
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

  it("marks in-progress run state when a child job has already failed", async () => {
    const { executor, calls } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify({
          status: "in_progress",
          conclusion: "",
          display_title: "Run tests",
          name: "CI",
          jobs_url: "https://api.github.com/repos/getsentry/sentry/actions/runs/123/jobs",
          html_url: "https://github.com/getsentry/sentry/actions/runs/123",
        }),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify({
          jobs: [
            {
              status: "completed",
              conclusion: "failure",
            },
            {
              status: "in_progress",
              conclusion: null,
            },
          ],
        }),
        stderr: "",
      },
    ]);

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
    ).resolves.toMatchObject({
      status: "in_progress",
      conclusion: null,
      hasFailedChildren: true,
      title: "CI: Run tests",
    });

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["api", "repos/getsentry/sentry/actions/runs/123"],
      },
      {
        program: "gh",
        args: ["api", "repos/getsentry/sentry/actions/runs/123/jobs?per_page=100"],
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
      metadata: {
        workflowName: "CI",
        jobName: "test (macos)",
      },
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

  it("fetches pull request check state with one gh pr checks call", async () => {
    const { executor, calls } = createExecutor({
      code: 8,
      stdout: JSON.stringify([
        {
          bucket: "pass",
          startedAt: "2026-05-16T12:00:00Z",
          completedAt: "2026-05-16T12:02:00Z",
        },
        {
          bucket: "pending",
          startedAt: "2026-05-16T12:03:00Z",
          completedAt: null,
        },
      ]),
      stderr: "",
    });

    await expect(
      fetchWatchState(
        {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        executor,
      ),
    ).resolves.toEqual({
      status: "in_progress",
      conclusion: null,
      title: "Pull request #51",
      metadata: {
        prTitle: "Pull request #51",
      },
      prNumber: "51",
      timing: {
        startedAt: "2026-05-16T12:00:00.000Z",
      },
      url: "https://github.com/getsentry/sentry/pull/51",
    });

    expect(calls).toEqual([
      {
        program: "gh",
        args: [
          "pr",
          "checks",
          "51",
          "-R",
          "getsentry/sentry",
          "--json",
          "bucket,completedAt,startedAt",
        ],
      },
    ]);
  });

  it("treats failed pull request checks as a parsed watch state", async () => {
    const { executor } = createExecutor({
      code: 1,
      stdout: JSON.stringify([{ bucket: "fail" }]),
      stderr: "",
    });

    await expect(
      fetchWatchState(
        {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        executor,
      ),
    ).resolves.toMatchObject({
      status: "completed",
      conclusion: "failure",
    });
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

describe("fetchRateLimit", () => {
  it("returns the most depleted API quota", async () => {
    const { executor, calls } = createExecutor({
      code: 0,
      stdout: JSON.stringify({
        resources: {
          core: {
            limit: 5000,
            used: 500,
            remaining: 4500,
            reset: 1786273200,
          },
          graphql: {
            limit: 5000,
            used: 4950,
            remaining: 50,
            reset: 1786275000,
          },
        },
      }),
      stderr: "",
    });

    await expect(fetchRateLimit(executor)).resolves.toEqual({
      resource: "GraphQL",
      limit: 5000,
      used: 4950,
      remaining: 50,
      reset: 1786275000,
    });

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["api", "/rate_limit"],
      },
    ]);
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

describe("fetchRepositoryDefaultBranch", () => {
  it("fetches the repository default branch via gh api", async () => {
    const { executor, calls } = createExecutor({
      code: 0,
      stdout: JSON.stringify({
        default_branch: "main",
      }),
      stderr: "",
    });

    await expect(
      fetchRepositoryDefaultBranch(
        {
          owner: "getsentry",
          repo: "sentry-native",
        },
        executor,
      ),
    ).resolves.toBe("main");

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["api", "repos/getsentry/sentry-native"],
      },
    ]);
  });
});

describe("fetchRepositoryDefaultBranchCiStatus", () => {
  it("summarizes the latest default branch workflow run", async () => {
    const { executor, calls } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify({
          default_branch: "main",
        }),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify({
          sha: "abc123",
        }),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify([
          {
            databaseId: 101,
            displayTitle: "Build main",
            event: "push",
            workflowName: "CI",
            headBranch: "main",
            headSha: "abc123",
            status: "completed",
            conclusion: "success",
            createdAt: "2026-05-17T12:00:00Z",
            updatedAt: "2026-05-17T12:05:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/101",
            workflowDatabaseId: 201,
          },
          {
            databaseId: 102,
            displayTitle: "Lint main",
            event: "push",
            workflowName: "Lint",
            headBranch: "main",
            headSha: "abc123",
            status: "completed",
            conclusion: "skipped",
            createdAt: "2026-05-17T12:01:00Z",
            updatedAt: "2026-05-17T12:06:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/102",
            workflowDatabaseId: 202,
          },
        ]),
        stderr: "",
      },
    ]);

    await expect(fetchRepositoryDefaultBranchCiStatus({ owner: "getsentry", repo: "sentry" }, executor)).resolves.toEqual({
      tone: "success",
      label: "Passing",
      description: "main: 2 workflows passed",
      defaultBranch: "main",
      commitSha: "abc123",
      updatedAt: "2026-05-17T12:06:00.000Z",
      url: "https://github.com/getsentry/sentry/actions/runs/101",
      workflows: [
        {
          tone: "success",
          label: "Passing",
          description: "CI passed",
          name: "CI",
          updatedAt: "2026-05-17T12:05:00Z",
          url: "https://github.com/getsentry/sentry/actions/runs/101",
        },
        {
          tone: "success",
          label: "Skipped",
          description: "Lint skipped",
          name: "Lint",
          updatedAt: "2026-05-17T12:06:00Z",
          url: "https://github.com/getsentry/sentry/actions/runs/102",
        },
      ],
    });

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["api", "repos/getsentry/sentry"],
      },
      {
        program: "gh",
        args: ["api", "repos/getsentry/sentry/commits/main"],
      },
      {
        program: "gh",
        args: [
          "run",
          "list",
          "-R",
          "getsentry/sentry",
          "--branch",
          "main",
          "--commit",
          "abc123",
          "--event",
          "push",
          "--limit",
          "100",
          "--json",
          "databaseId,displayTitle,event,workflowDatabaseId,workflowName,headBranch,headSha,status,conclusion,createdAt,updatedAt,url",
        ],
      },
    ]);
  });

  it("ignores same-branch workflow runs that are not push builds for the latest commit", async () => {
    const { executor } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify({
          default_branch: "main",
        }),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify({
          sha: "abc123",
        }),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify([
          {
            displayTitle: "Build main",
            event: "push",
            workflowName: "CI",
            headBranch: "main",
            headSha: "abc123",
            status: "completed",
            conclusion: "success",
            updatedAt: "2026-05-17T12:05:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/123",
          },
          {
            displayTitle: "Deploy main",
            event: "push",
            workflowName: "Deploy",
            headBranch: "main",
            headSha: "older456",
            status: "in_progress",
            conclusion: "",
            updatedAt: "2026-05-17T12:06:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/456",
          },
          {
            displayTitle: "Manual release",
            event: "workflow_dispatch",
            workflowName: "Release",
            headBranch: "main",
            headSha: "abc123",
            status: "in_progress",
            conclusion: "",
            updatedAt: "2026-05-17T12:07:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/789",
          },
        ]),
        stderr: "",
      },
    ]);

    await expect(fetchRepositoryDefaultBranchCiStatus({ owner: "getsentry", repo: "sentry" }, executor)).resolves.toMatchObject({
      tone: "success",
      label: "Passing",
      description: "main: 1 workflow passed",
      commitSha: "abc123",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
      workflows: [
        {
          tone: "success",
          label: "Passing",
          description: "CI passed",
          name: "CI",
          updatedAt: "2026-05-17T12:05:00Z",
          url: "https://github.com/getsentry/sentry/actions/runs/123",
        },
      ],
    });
  });

  it("marks default branch CI pending when the latest workflow run has not completed", async () => {
    const { executor } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify({
          default_branch: "main",
        }),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify({
          sha: "abc123",
        }),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify([
          {
            displayTitle: "Build main",
            event: "push",
            workflowName: "CI",
            headBranch: "main",
            headSha: "abc123",
            status: "in_progress",
            conclusion: "",
            updatedAt: "2026-05-17T12:05:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/123",
          },
        ]),
        stderr: "",
      },
    ]);

    await expect(fetchRepositoryDefaultBranchCiStatus({ owner: "getsentry", repo: "sentry" }, executor)).resolves.toMatchObject({
      tone: "pending",
      label: "Pending",
      description: "main: 1 workflow pending",
      commitSha: "abc123",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
      workflows: [
        {
          tone: "pending",
          label: "Pending",
          description: "CI is in progress",
          name: "CI",
          updatedAt: "2026-05-17T12:05:00Z",
          url: "https://github.com/getsentry/sentry/actions/runs/123",
        },
      ],
    });
  });

  it("marks default branch CI failing when the latest workflow run did not pass", async () => {
    const { executor } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify({
          default_branch: "main",
        }),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify({
          sha: "abc123",
        }),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify([
          {
            displayTitle: "Build main",
            event: "push",
            workflowName: "CI",
            headBranch: "main",
            headSha: "abc123",
            status: "completed",
            conclusion: "failure",
            updatedAt: "2026-05-17T12:05:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/123",
          },
        ]),
        stderr: "",
      },
    ]);

    await expect(fetchRepositoryDefaultBranchCiStatus({ owner: "getsentry", repo: "sentry" }, executor)).resolves.toMatchObject({
      tone: "failure",
      label: "Failing",
      description: "main: 1 workflow failing",
      commitSha: "abc123",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
      workflows: [
        {
          tone: "failure",
          label: "Failing",
          description: "CI failure",
          name: "CI",
          updatedAt: "2026-05-17T12:05:00Z",
          url: "https://github.com/getsentry/sentry/actions/runs/123",
        },
      ],
    });
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

describe("fetchOpenPullRequests", () => {
  it("fetches open pull requests through gh and sorts them by update time", async () => {
    const { executor, calls } = createExecutor({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 51,
          title: "Older PR",
          isDraft: false,
          headRefName: "older-pr",
          updatedAt: "2026-05-16T12:00:00Z",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        {
          number: 52,
          title: "Newer PR",
          isDraft: true,
          headRefName: "newer-pr",
          updatedAt: "2026-05-17T12:00:00Z",
          url: "https://github.com/getsentry/sentry/pull/52",
        },
      ]),
      stderr: "",
    });

    await expect(
      fetchOpenPullRequests(
        {
          owner: "getsentry",
          repo: "sentry",
        },
        executor,
      ),
    ).resolves.toEqual([
      {
        number: "52",
        title: "Newer PR",
        isDraft: true,
        headBranch: "newer-pr",
        updatedAt: "2026-05-17T12:00:00Z",
        url: "https://github.com/getsentry/sentry/pull/52",
      },
      {
        number: "51",
        title: "Older PR",
        isDraft: false,
        headBranch: "older-pr",
        updatedAt: "2026-05-16T12:00:00Z",
        url: "https://github.com/getsentry/sentry/pull/51",
      },
    ]);

    expect(calls).toEqual([
      {
        program: "gh",
        args: [
          "pr",
          "list",
          "-R",
          "getsentry/sentry",
          "--state",
          "open",
          "--limit",
          "20",
          "--json",
          "number,title,isDraft,headRefName,updatedAt,url",
        ],
      },
    ]);
  });

  it("drops malformed pull requests from the gh response", async () => {
    const { executor } = createExecutor({
      code: 0,
      stdout: JSON.stringify([
        { number: 51, title: "Valid PR", isDraft: false, url: "https://github.com/getsentry/sentry/pull/51" },
        { number: 0, title: "Invalid number", isDraft: false, url: "https://github.com/getsentry/sentry/pull/0" },
        { number: 52, title: "", isDraft: false, url: "https://github.com/getsentry/sentry/pull/52" },
      ]),
      stderr: "",
    });

    await expect(fetchOpenPullRequests({ owner: "getsentry", repo: "sentry" }, executor)).resolves.toEqual([
      {
        number: "51",
        title: "Valid PR",
        isDraft: false,
        url: "https://github.com/getsentry/sentry/pull/51",
      },
    ]);
  });
});

describe("fetchWorkflowDefinitions", () => {
  it("fetches workflows through gh and sorts them by name", async () => {
    const { executor, calls } = createExecutor({
      code: 0,
      stdout: JSON.stringify([
        { name: "CodeQL", path: ".github/workflows/codeql.yml", state: "active" },
        { name: "CI", path: ".github/workflows/ci.yml", state: "active" },
        { name: "CI", path: ".github/workflows/ci-duplicate.yml", state: "active" },
        { name: "", path: ".github/workflows/malformed.yml", state: "active" },
      ]),
      stderr: "",
    });

    await expect(fetchWorkflowDefinitions({ owner: "getsentry", repo: "sentry" }, executor)).resolves.toEqual([
      {
        name: "CI",
        path: ".github/workflows/ci.yml",
        state: "active",
      },
      {
        name: "CodeQL",
        path: ".github/workflows/codeql.yml",
        state: "active",
      },
    ]);

    expect(calls).toEqual([
      {
        program: "gh",
        args: [
          "workflow",
          "list",
          "-R",
          "getsentry/sentry",
          "--limit",
          "100",
          "--json",
          "name,path,state",
        ],
      },
    ]);
  });
});

describe("fetchActiveWorkflowRuns", () => {
  it("fetches active workflow runs through gh and sorts them by update time", async () => {
    const { executor, calls } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify([
          {
            databaseId: 101,
            displayTitle: "Older run",
            workflowName: "CI",
            headBranch: "main",
            status: "queued",
            createdAt: "2026-05-17T10:00:00Z",
            updatedAt: "2026-05-17T10:05:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/101",
          },
        ]),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify([
          {
            databaseId: 102,
            displayTitle: "Newer run",
            workflowName: "Deploy",
            headBranch: "release/0.2",
            status: "in_progress",
            createdAt: "2026-05-17T11:00:00Z",
            updatedAt: "2026-05-17T11:05:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/102",
          },
        ]),
        stderr: "",
      },
    ]);

    await expect(fetchActiveWorkflowRuns({ owner: "getsentry", repo: "sentry" }, executor)).resolves.toEqual([
      {
        runId: "102",
        title: "Deploy: Newer run",
        workflowName: "Deploy",
        status: "in_progress",
        branchName: "release/0.2",
        createdAt: "2026-05-17T11:00:00Z",
        updatedAt: "2026-05-17T11:05:00Z",
        url: "https://github.com/getsentry/sentry/actions/runs/102",
      },
      {
        runId: "101",
        title: "CI: Older run",
        workflowName: "CI",
        status: "queued",
        branchName: "main",
        createdAt: "2026-05-17T10:00:00Z",
        updatedAt: "2026-05-17T10:05:00Z",
        url: "https://github.com/getsentry/sentry/actions/runs/101",
      },
    ]);

    expect(calls).toEqual([
      {
        program: "gh",
        args: [
          "run",
          "list",
          "-R",
          "getsentry/sentry",
          "--status",
          "queued",
          "--limit",
          "20",
          "--json",
          "databaseId,displayTitle,workflowName,headBranch,status,createdAt,updatedAt,url",
        ],
      },
      {
        program: "gh",
        args: [
          "run",
          "list",
          "-R",
          "getsentry/sentry",
          "--status",
          "in_progress",
          "--limit",
          "20",
          "--json",
          "databaseId,displayTitle,workflowName,headBranch,status,createdAt,updatedAt,url",
        ],
      },
    ]);
  });

  it("fetches active workflow runs triggered by a user", async () => {
    const { executor, calls } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify([
          {
            databaseId: 101,
            displayTitle: "Manual run",
            workflowName: "CI",
            headBranch: "main",
            status: "queued",
            updatedAt: "2026-05-17T10:05:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/101",
          },
        ]),
        stderr: "",
      },
      {
        code: 0,
        stdout: "[]",
        stderr: "",
      },
    ]);

    await expect(
      fetchUserActiveWorkflowRuns({ owner: "getsentry", repo: "sentry" }, "jpnurmi", executor),
    ).resolves.toEqual([
      {
        runId: "101",
        title: "CI: Manual run",
        workflowName: "CI",
        status: "queued",
        branchName: "main",
        updatedAt: "2026-05-17T10:05:00Z",
        url: "https://github.com/getsentry/sentry/actions/runs/101",
      },
    ]);

    expect(calls).toEqual([
      {
        program: "gh",
        args: [
          "run",
          "list",
          "-R",
          "getsentry/sentry",
          "--status",
          "queued",
          "--limit",
          "20",
          "--user",
          "jpnurmi",
          "--json",
          "databaseId,displayTitle,workflowName,headBranch,status,createdAt,updatedAt,url",
        ],
      },
      {
        program: "gh",
        args: [
          "run",
          "list",
          "-R",
          "getsentry/sentry",
          "--status",
          "in_progress",
          "--limit",
          "20",
          "--user",
          "jpnurmi",
          "--json",
          "databaseId,displayTitle,workflowName,headBranch,status,createdAt,updatedAt,url",
        ],
      },
    ]);
  });

  it("drops malformed workflow runs from the gh response", async () => {
    const { executor } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify([
          {
            databaseId: 101,
            displayTitle: "Valid run",
            workflowName: "CI",
            status: "queued",
            url: "https://github.com/getsentry/sentry/actions/runs/101",
          },
          {
            databaseId: 0,
            displayTitle: "Invalid run id",
            workflowName: "CI",
            status: "queued",
            url: "https://github.com/getsentry/sentry/actions/runs/0",
          },
          {
            databaseId: 102,
            displayTitle: "",
            workflowName: "",
            status: "queued",
            url: "https://github.com/getsentry/sentry/actions/runs/102",
          },
        ]),
        stderr: "",
      },
      {
        code: 0,
        stdout: "[]",
        stderr: "",
      },
    ]);

    await expect(fetchActiveWorkflowRuns({ owner: "getsentry", repo: "sentry" }, executor)).resolves.toEqual([
      {
        runId: "101",
        title: "CI: Valid run",
        workflowName: "CI",
        status: "queued",
        url: "https://github.com/getsentry/sentry/actions/runs/101",
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
