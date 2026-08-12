import { describe, expect, it } from "vitest";
import {
  fetchActiveWorkflowRuns,
  fetchAuthenticatedUserLogin,
  fetchOpenPullRequests,
  fetchPullRequestDetails,
  fetchRateLimit,
  fetchRepositoryDefaultBranchCiStatus,
  fetchRepositoryDefaultBranch,
  fetchRepositoryBranches,
  fetchRepositoryIconUrl,
  fetchUserActiveWorkflowRuns,
  fetchWatchState,
  fetchWorkflowDefinitions,
  fetchWorkflowRuns,
  rerunWatch,
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
        head_sha: "abc123",
        created_at: "2026-05-16T12:00:00Z",
        run_started_at: "2026-05-16T12:02:00Z",
        updated_at: "2026-05-16T12:03:00Z",
        html_url: "https://github.com/getsentry/sentry/actions/runs/123",
        pull_requests: [
          {
            number: 51,
            base: { repo: { url: "https://api.github.com/repos/getsentry/sentry" } },
          },
        ],
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
        commitSha: "abc123",
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

  it("ignores pull request references from another base repository", async () => {
    const { executor } = createExecutor({
      code: 0,
      stdout: JSON.stringify({
        status: "completed",
        conclusion: "success",
        display_title: "feat: report SDK integrations (#1969)",
        name: "CI",
        head_branch: "master",
        html_url: "https://github.com/getsentry/sentry-native/actions/runs/31382160146",
        pull_requests: [
          {
            number: 22,
            base: { repo: { url: "https://api.github.com/repos/mystaff/sentry-native" } },
          },
        ],
      }),
      stderr: "",
    });

    await expect(
      fetchWatchState(
        {
          kind: "run",
          owner: "getsentry",
          repo: "sentry-native",
          runId: "31382160146",
          url: "https://github.com/getsentry/sentry-native/actions/runs/31382160146",
        },
        executor,
      ),
    ).resolves.not.toHaveProperty("prNumber");
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
        {
          bucket: "skipping",
          startedAt: "0001-01-01T00:00:00Z",
          completedAt: "0001-01-01T00:00:00Z",
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

  it("fetches pull request lifecycle details in one batch", async () => {
    const { executor, calls } = createExecutor({
      code: 0,
      stdout: JSON.stringify({
        data: {
          repository0: {
            pullRequest: {
              headRefName: "feature/draft",
              isDraft: true,
              state: "OPEN",
              title: "Draft pull request",
            },
          },
          repository1: {
            pullRequest: { isDraft: false, state: "OPEN", title: "Ready pull request" },
          },
          repository2: {
            pullRequest: { isDraft: false, state: "MERGED", title: "Merged pull request" },
          },
          repository3: {
            pullRequest: { isDraft: false, state: "CLOSED", title: "Closed pull request" },
          },
        },
      }),
      stderr: "",
    });
    const targets = ["51", "52", "53", "54"].map((prNumber) => ({
      kind: "pr" as const,
      owner: "getsentry",
      repo: "sentry",
      prNumber,
      url: `https://github.com/getsentry/sentry/pull/${prNumber}`,
    }));

    await expect(fetchPullRequestDetails(targets, executor)).resolves.toEqual([
      { branchName: "feature/draft", state: "draft", title: "Draft pull request" },
      { state: "ready", title: "Ready pull request" },
      { state: "merged", title: "Merged pull request" },
      { state: "closed", title: "Closed pull request" },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].program).toBe("gh");
    expect(calls[0].args.slice(0, 4)).toEqual([
      "api",
      "graphql",
      "-f",
      expect.stringContaining("pullRequest(number: $number3)"),
    ]);
    expect(calls[0].args).toContain("number3=54");
    expect(calls[0].args[3]).toContain("headRefName");
  });

  it("keeps missing pull request details isolated within a batch", async () => {
    const { executor } = createExecutor({
      code: 0,
      stdout: JSON.stringify({
        data: {
          repository0: { pullRequest: null },
          repository1: {
            pullRequest: { isDraft: false, state: "OPEN", title: "Ready pull request" },
          },
        },
      }),
      stderr: "",
    });

    await expect(
      fetchPullRequestDetails(
        [
          {
            kind: "pr",
            owner: "getsentry",
            repo: "sentry",
            prNumber: "51",
            url: "https://github.com/getsentry/sentry/pull/51",
          },
          {
            kind: "pr",
            owner: "getsentry",
            repo: "sentry",
            prNumber: "52",
            url: "https://github.com/getsentry/sentry/pull/52",
          },
        ],
        executor,
      ),
    ).resolves.toEqual([undefined, { state: "ready", title: "Ready pull request" }]);
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

  it("keeps a pull request active while failed checks have unfinished siblings", async () => {
    const { executor } = createExecutor({
      code: 1,
      stdout: JSON.stringify([{ bucket: "fail" }, { bucket: "pending" }]),
      stderr: "",
    });

    await expect(
      fetchWatchState(
        {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry-native",
          prNumber: "1968",
          url: "https://github.com/getsentry/sentry-native/pull/1968",
        },
        executor,
      ),
    ).resolves.toMatchObject({
      status: "in_progress",
      conclusion: null,
      hasFailedChildren: true,
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
  it("summarizes the latest known default branch workflow run in two requests", async () => {
    const { executor, calls } = createSequenceExecutor([
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

    await expect(
      fetchRepositoryDefaultBranchCiStatus(
        { owner: "getsentry", repo: "sentry" },
        { defaultBranch: "main" },
        executor,
      ),
    ).resolves.toEqual({
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

    await expect(fetchRepositoryDefaultBranchCiStatus({ owner: "getsentry", repo: "sentry" }, {}, executor)).resolves.toMatchObject({
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

    await expect(fetchRepositoryDefaultBranchCiStatus({ owner: "getsentry", repo: "sentry" }, {}, executor)).resolves.toMatchObject({
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

    await expect(fetchRepositoryDefaultBranchCiStatus({ owner: "getsentry", repo: "sentry" }, {}, executor)).resolves.toMatchObject({
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
          author: { login: "octocat" },
          headRefName: "older-pr",
          updatedAt: "2026-05-16T12:00:00Z",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        {
          number: 52,
          title: "Newer PR",
          isDraft: true,
          author: { login: "jpnurmi" },
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
        authorLogin: "jpnurmi",
        headBranch: "newer-pr",
        updatedAt: "2026-05-17T12:00:00Z",
        url: "https://github.com/getsentry/sentry/pull/52",
      },
      {
        number: "51",
        title: "Older PR",
        isDraft: false,
        authorLogin: "octocat",
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
          "100",
          "--json",
          "number,title,isDraft,author,headRefName,updatedAt,url",
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

describe("fetchRepositoryBranches", () => {
  it("loads authoritative branch choices while ignoring malformed entries", async () => {
    const { executor, calls } = createExecutor({
      code: 0,
      stdout: JSON.stringify([
        { name: "release/1.x" },
        { name: "main" },
        { name: "main" },
        { name: "" },
      ]),
      stderr: "",
    });

    await expect(fetchRepositoryBranches({ owner: "getsentry", repo: "sentry" }, executor)).resolves.toEqual([
      "main",
      "release/1.x",
    ]);
    expect(calls).toEqual([{
      program: "gh",
      args: ["api", "repos/getsentry/sentry/branches?per_page=100"],
    }]);
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
          "databaseId,displayTitle,event,workflowName,headBranch,status,createdAt,updatedAt,url",
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
          "databaseId,displayTitle,event,workflowName,headBranch,status,createdAt,updatedAt,url",
        ],
      },
    ]);
  });

  it("fetches active manually dispatched workflow runs triggered by a user", async () => {
    const { executor, calls } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify([
          {
            databaseId: 101,
            displayTitle: "Manual run",
            event: "workflow_dispatch",
            workflowName: "CI",
            headBranch: "feature/pr-watch",
            status: "queued",
            updatedAt: "2026-05-17T10:05:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/101",
          },
          {
            databaseId: 102,
            displayTitle: "Pull request run",
            event: "pull_request",
            workflowName: "CI",
            headBranch: "main",
            status: "queued",
            updatedAt: "2026-05-17T10:06:00Z",
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

    await expect(
      fetchUserActiveWorkflowRuns({ owner: "getsentry", repo: "sentry" }, "jpnurmi", executor),
    ).resolves.toEqual([
      {
        runId: "101",
        title: "CI: Manual run",
        event: "workflow_dispatch",
        workflowName: "CI",
        status: "queued",
        branchName: "feature/pr-watch",
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
          "databaseId,displayTitle,event,workflowName,headBranch,status,createdAt,updatedAt,url",
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
          "databaseId,displayTitle,event,workflowName,headBranch,status,createdAt,updatedAt,url",
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

describe("fetchWorkflowRuns", () => {
  it("fetches generalized run metadata once through the repository REST endpoint", async () => {
    const { executor, calls } = createExecutor({
      code: 0,
      stdout: JSON.stringify({
        workflow_runs: [
          {
            id: 102,
            workflow_id: 12,
            name: "Deploy",
            display_title: "Package app",
            event: "workflow_dispatch",
            actor: { login: "jpnurmi" },
            head_branch: "release/1.x",
            status: "in_progress",
            conclusion: null,
            created_at: "2026-08-12T10:00:00Z",
            run_started_at: "2026-08-12T10:01:00Z",
            updated_at: "2026-08-12T10:02:00Z",
            html_url: "https://github.com/getsentry/sentry/actions/runs/102",
          },
          {
            id: 101,
            workflow_id: 11,
            name: "CI",
            display_title: "Tests",
            event: "push",
            actor: { login: "octocat" },
            head_branch: "main",
            status: "completed",
            conclusion: "success",
            created_at: "2026-08-12T09:00:00Z",
            updated_at: "2026-08-12T09:05:00Z",
            html_url: "https://github.com/getsentry/sentry/actions/runs/101",
          },
        ],
      }),
      stderr: "",
    });

    await expect(fetchWorkflowRuns({ owner: "getsentry", repo: "sentry" }, {}, executor)).resolves.toEqual({
      runs: [
      {
        runId: "102",
        workflowId: "12",
        title: "Deploy: Package app",
        event: "workflow_dispatch",
        actorLogin: "jpnurmi",
        workflowName: "Deploy",
        status: "in_progress",
        branchName: "release/1.x",
        createdAt: "2026-08-12T10:00:00Z",
        startedAt: "2026-08-12T10:01:00Z",
        updatedAt: "2026-08-12T10:02:00Z",
        url: "https://github.com/getsentry/sentry/actions/runs/102",
      },
      {
        runId: "101",
        workflowId: "11",
        title: "CI: Tests",
        event: "push",
        actorLogin: "octocat",
        workflowName: "CI",
        status: "completed",
        conclusion: "success",
        branchName: "main",
        createdAt: "2026-08-12T09:00:00Z",
        updatedAt: "2026-08-12T09:05:00Z",
        url: "https://github.com/getsentry/sentry/actions/runs/101",
      },
      ],
    });
    expect(calls).toEqual([
      {
        program: "gh",
        args: ["api", "repos/getsentry/sentry/actions/runs?status=queued&per_page=100&page=1"],
      },
      {
        program: "gh",
        args: ["api", "repos/getsentry/sentry/actions/runs?status=in_progress&per_page=100&page=1"],
      },
    ]);
  });

  it("finds active runs beyond the first full status page with bounded pagination", async () => {
    const calls: string[][] = [];
    const fullQueuedPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: "Other",
      display_title: `Queued ${index + 1}`,
      event: "push",
      actor: { login: "octocat" },
      head_branch: "main",
      status: "queued",
      updated_at: `2026-08-12T09:${String(index % 60).padStart(2, "0")}:00Z`,
      html_url: `https://github.com/getsentry/sentry/actions/runs/${index + 1}`,
    }));
    const executor: ShellExecutor = {
      async execute(_program, args) {
        calls.push(args);
        const endpoint = args[1];

        if (endpoint.includes("status=queued") && endpoint.endsWith("page=1")) {
          return { code: 0, stdout: JSON.stringify({ workflow_runs: fullQueuedPage }), stderr: "" };
        }

        if (endpoint.includes("status=queued") && endpoint.endsWith("page=2")) {
          return {
            code: 0,
            stdout: JSON.stringify({
              workflow_runs: [{
                id: 501,
                workflow_id: 12,
                name: "Deploy",
                display_title: "Release package",
                event: "push",
                actor: { login: "jpnurmi" },
                head_branch: "release/1.x",
                status: "queued",
                updated_at: "2026-08-12T08:00:00Z",
                html_url: "https://github.com/getsentry/sentry/actions/runs/501",
              }],
            }),
            stderr: "",
          };
        }

        return { code: 0, stdout: JSON.stringify({ workflow_runs: [] }), stderr: "" };
      },
    };

    const { runs } = await fetchWorkflowRuns({ owner: "getsentry", repo: "sentry" }, {}, executor);

    expect(runs).toContainEqual(expect.objectContaining({
      runId: "501",
      workflowName: "Deploy",
      branchName: "release/1.x",
      status: "queued",
    }));
    expect(calls).toEqual([
      ["api", "repos/getsentry/sentry/actions/runs?status=queued&per_page=100&page=1"],
      ["api", "repos/getsentry/sentry/actions/runs?status=in_progress&per_page=100&page=1"],
      ["api", "repos/getsentry/sentry/actions/runs?status=queued&per_page=100&page=2"],
    ]);
  });

  it("discovers completed runs created after a cursor", async () => {
    const calls: string[][] = [];
    const executor: ShellExecutor = {
      async execute(_program, args) {
        calls.push(args);

        if (args[1].includes("created=")) {
          return {
            code: 0,
            stdout: JSON.stringify({
              workflow_runs: [{
                id: 601,
                workflow_id: 13,
                name: "CI",
                display_title: "Fast tests",
                event: "push",
                actor: { login: "jpnurmi" },
                head_branch: "main",
                status: "completed",
                conclusion: "success",
                created_at: "2026-08-12T10:00:05Z",
                updated_at: "2026-08-12T10:00:15Z",
                html_url: "https://github.com/getsentry/sentry/actions/runs/601",
              }],
            }),
            stderr: "",
          };
        }

        return { code: 0, stdout: JSON.stringify({ workflow_runs: [] }), stderr: "" };
      },
    };

    await expect(fetchWorkflowRuns(
      { owner: "getsentry", repo: "sentry" },
      {
        createdAfter: "2026-08-12T10:00:00.000Z",
        createdBefore: "2026-08-12T10:00:30.000Z",
      },
      executor,
    )).resolves.toEqual({
      runs: [expect.objectContaining({
        runId: "601",
        status: "completed",
        conclusion: "success",
        createdAt: "2026-08-12T10:00:05Z",
      })],
    });
    expect(calls).toContainEqual([
      "api",
      "repos/getsentry/sentry/actions/runs?per_page=100&page=1&created=2026-08-12T10%3A00%3A00.000Z..2026-08-12T10%3A00%3A30.000Z",
    ]);
  });

  it("caps active run pagination per status", async () => {
    const calls: string[][] = [];
    const fullPage = {
      workflow_runs: Array.from({ length: 100 }, (_, index) => ({
        id: index + 1,
        name: "CI",
        display_title: "Build",
        status: "queued",
        html_url: `https://github.com/getsentry/sentry/actions/runs/${index + 1}`,
      })),
    };
    const executor: ShellExecutor = {
      async execute(_program, args) {
        calls.push(args);
        return { code: 0, stdout: JSON.stringify(fullPage), stderr: "" };
      },
    };

    await fetchWorkflowRuns({ owner: "getsentry", repo: "sentry" }, {}, executor);

    expect(calls).toHaveLength(6);
    expect(calls.every((args) => !args[1].endsWith("page=4"))).toBe(true);
  });

  it("returns the next catch-up page when a cursor scan reaches its page cap", async () => {
    const fullPage = {
      workflow_runs: Array.from({ length: 100 }, (_, index) => ({
        id: index + 1,
        name: "CI",
        display_title: "Build",
        status: "completed",
        conclusion: "success",
        created_at: "2026-08-12T10:00:01Z",
        html_url: `https://github.com/getsentry/sentry/actions/runs/${index + 1}`,
      })),
    };
    const executor: ShellExecutor = {
      async execute(_program, args) {
        return {
          code: 0,
          stdout: JSON.stringify(args[1].includes("created=") ? fullPage : { workflow_runs: [] }),
          stderr: "",
        };
      },
    };

    const batch = await fetchWorkflowRuns(
      { owner: "getsentry", repo: "sentry" },
      {
        createdAfter: "2026-08-12T10:00:00.000Z",
        createdBefore: "2026-08-12T10:00:30.000Z",
      },
      executor,
    );

    expect(batch.nextCatchUpPage).toBe(4);
  });

  it("resumes a stable all-status interval after a run changes from active to completed", async () => {
    let phase = 1;
    const catchUpCalls: string[] = [];
    const executor: ShellExecutor = {
      async execute(_program, args) {
        const endpoint = args[1];

        if (endpoint.includes("status=")) {
          return { code: 0, stdout: JSON.stringify({ workflow_runs: [] }), stderr: "" };
        }

        catchUpCalls.push(endpoint);
        const page = Number(new URL(`https://api.github.test/?${endpoint.split("?")[1]}`).searchParams.get("page"));

        if (phase === 1 && page <= 3) {
          return {
            code: 0,
            stdout: JSON.stringify({
              workflow_runs: Array.from({ length: 100 }, (_, index) => ({
                id: page * 1000 + index,
                name: "CI",
                display_title: "Build",
                status: page === 1 && index === 0 ? "in_progress" : "completed",
                conclusion: page === 1 && index === 0 ? null : "success",
                created_at: "2026-08-12T10:00:05Z",
                html_url: `https://github.com/getsentry/sentry/actions/runs/${page * 1000 + index}`,
              })),
            }),
            stderr: "",
          };
        }

        if (phase === 2 && page === 4) {
          return {
            code: 0,
            stdout: JSON.stringify({
              workflow_runs: [{
                id: 9999,
                name: "Deploy",
                display_title: "Older match",
                event: "push",
                head_branch: "release/1.x",
                status: "completed",
                conclusion: "success",
                created_at: "2026-08-12T10:00:01Z",
                html_url: "https://github.com/getsentry/sentry/actions/runs/9999",
              }],
            }),
            stderr: "",
          };
        }

        return { code: 0, stdout: JSON.stringify({ workflow_runs: [] }), stderr: "" };
      },
    };
    const range = {
      createdAfter: "2026-08-12T10:00:00.000Z",
      createdBefore: "2026-08-12T10:00:30.000Z",
    };

    const first = await fetchWorkflowRuns({ owner: "getsentry", repo: "sentry" }, range, executor);
    phase = 2;
    const second = await fetchWorkflowRuns(
      { owner: "getsentry", repo: "sentry" },
      { ...range, catchUpPage: first.nextCatchUpPage },
      executor,
    );

    expect(first.nextCatchUpPage).toBe(4);
    expect(second.runs).toContainEqual(expect.objectContaining({ runId: "9999" }));
    expect(catchUpCalls).toHaveLength(4);
    expect(catchUpCalls.every((endpoint) => !endpoint.includes("status="))).toBe(true);
    expect(catchUpCalls.at(-1)).toContain("page=4");
  });
});

describe("rerunWatch", () => {
  it("reruns only failed jobs for a run watch", async () => {
    const { executor, calls } = createExecutor({ code: 0, stdout: "", stderr: "" });

    await rerunWatch(
      {
        kind: "run",
        owner: "getsentry",
        repo: "sentry",
        runId: "123",
        url: "https://github.com/getsentry/sentry/actions/runs/123",
      },
      "failed",
      executor,
    );

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["run", "rerun", "123", "--failed", "-R", "getsentry/sentry"],
      },
    ]);
  });

  it("reruns all jobs for a run watch", async () => {
    const { executor, calls } = createExecutor({ code: 0, stdout: "", stderr: "" });

    await rerunWatch(
      {
        kind: "run",
        owner: "getsentry",
        repo: "sentry",
        runId: "123",
        url: "https://github.com/getsentry/sentry/actions/runs/123",
      },
      "all",
      executor,
    );

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["run", "rerun", "123", "-R", "getsentry/sentry"],
      },
    ]);
  });

  it("reruns failed jobs for a job watch when the run id is known", async () => {
    const { executor, calls } = createExecutor({ code: 0, stdout: "", stderr: "" });

    await rerunWatch(
      {
        kind: "job",
        owner: "getsentry",
        repo: "sentry",
        runId: "123",
        jobId: "456",
        url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
      },
      "failed",
      executor,
    );

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["run", "rerun", "123", "--failed", "-R", "getsentry/sentry"],
      },
    ]);
  });

  it("reruns only failed GitHub Actions jobs for a pull request", async () => {
    const { executor, calls } = createSequenceExecutor([
      {
        code: 1,
        stdout: JSON.stringify([
          {
            bucket: "fail",
            link: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
          },
          {
            bucket: "pass",
            link: "https://github.com/getsentry/sentry/actions/runs/789/job/1011",
          },
          {
            bucket: "fail",
            link: "https://github.com/getsentry/sentry/actions/runs/123/job/457",
          },
          {
            bucket: "fail",
            link: "https://github.com/getsentry/sentry/actions/runs/789/job/1012",
          },
          {
            bucket: "fail",
            link: "https://checks.example.com/build/42",
          },
        ]),
        stderr: "",
      },
      { code: 0, stdout: "", stderr: "" },
      { code: 0, stdout: "", stderr: "" },
    ]);

    await rerunWatch(
      {
        kind: "pr",
        owner: "getsentry",
        repo: "sentry",
        prNumber: "51",
        url: "https://github.com/getsentry/sentry/pull/51",
      },
      "failed",
      executor,
    );

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["pr", "checks", "51", "-R", "getsentry/sentry", "--json", "bucket,link"],
      },
      {
        program: "gh",
        args: ["run", "rerun", "123", "--failed", "-R", "getsentry/sentry"],
      },
      {
        program: "gh",
        args: ["run", "rerun", "789", "--failed", "-R", "getsentry/sentry"],
      },
    ]);
  });

  it("reruns all jobs in failed GitHub Actions runs for a pull request", async () => {
    const { executor, calls } = createSequenceExecutor([
      {
        code: 1,
        stdout: JSON.stringify([
          {
            bucket: "fail",
            link: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
          },
          {
            bucket: "pass",
            link: "https://github.com/getsentry/sentry/actions/runs/789/job/1011",
          },
        ]),
        stderr: "",
      },
      { code: 0, stdout: "", stderr: "" },
    ]);

    await rerunWatch(
      {
        kind: "pr",
        owner: "getsentry",
        repo: "sentry",
        prNumber: "51",
        url: "https://github.com/getsentry/sentry/pull/51",
      },
      "all",
      executor,
    );

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["pr", "checks", "51", "-R", "getsentry/sentry", "--json", "bucket,link"],
      },
      {
        program: "gh",
        args: ["run", "rerun", "123", "-R", "getsentry/sentry"],
      },
    ]);
  });

  it("reruns all jobs in cancelled GitHub Actions runs for a pull request", async () => {
    const { executor, calls } = createSequenceExecutor([
      {
        code: 1,
        stdout: JSON.stringify([
          {
            bucket: "cancel",
            link: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
          },
          {
            bucket: "cancel",
            link: "https://checks.example.com/build/42",
          },
          {
            bucket: "pass",
            link: "https://github.com/getsentry/sentry/actions/runs/789/job/1011",
          },
        ]),
        stderr: "",
      },
      { code: 0, stdout: "", stderr: "" },
    ]);

    await rerunWatch(
      {
        kind: "pr",
        owner: "getsentry",
        repo: "sentry",
        prNumber: "51",
        url: "https://github.com/getsentry/sentry/pull/51",
      },
      "all",
      executor,
    );

    expect(calls).toEqual([
      {
        program: "gh",
        args: ["pr", "checks", "51", "-R", "getsentry/sentry", "--json", "bucket,link"],
      },
      {
        program: "gh",
        args: ["run", "rerun", "123", "-R", "getsentry/sentry"],
      },
    ]);
  });

  it("rejects pull requests without failed GitHub Actions jobs", async () => {
    const { executor, calls } = createExecutor({
      code: 1,
      stdout: JSON.stringify([
        { bucket: "fail", link: "https://checks.example.com/build/42" },
        {
          bucket: "pass",
          link: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
        },
      ]),
      stderr: "",
    });

    await expect(
      rerunWatch(
        {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        "failed",
        executor,
      ),
    ).rejects.toThrow("No failed GitHub Actions jobs were found for this pull request.");

    expect(calls).toHaveLength(1);
  });

  it("rejects job watches without a run id", async () => {
    const { executor, calls } = createExecutor({ code: 0, stdout: "", stderr: "" });

    await expect(
      rerunWatch(
        {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          jobId: "456",
          url: "https://github.com/getsentry/sentry/runs/456",
        },
        "failed",
        executor,
      ),
    ).rejects.toThrow("This job link does not include a workflow run id.");

    expect(calls).toEqual([]);
  });
});
