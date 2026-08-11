import { describe, expect, it } from "vitest";
import { createWatchController, type WatchControllerDeps } from "./watchController";
import type { CheckWatchTarget, PrWatchTarget, RunWatchTarget, WatchTarget } from "../domain/githubUrl";
import type { WatchedRepo } from "../domain/watchedRepos";
import type { WatchSuppression } from "../domain/watchSuppressions";
import { type WatchRecord } from "../domain/watches";
import type { ActiveWorkflowRun, OpenPullRequest, WatchSnapshot, WorkflowDefinition } from "../platform/gh";

const runTarget: CheckWatchTarget = {
  kind: "run",
  owner: "getsentry",
  repo: "sentry",
  runId: "123",
  url: "https://github.com/getsentry/sentry/actions/runs/123",
};

const jobTarget: CheckWatchTarget = {
  kind: "job",
  owner: "getsentry",
  repo: "sentry",
  runId: "123",
  jobId: "456",
  url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
};

const prTarget: PrWatchTarget = {
  kind: "pr",
  owner: "getsentry",
  repo: "sentry",
  prNumber: "51",
  url: "https://github.com/getsentry/sentry/pull/51",
};

const prRunTarget: RunWatchTarget = {
  kind: "run",
  owner: "getsentry",
  repo: "sentry",
  runId: "789",
  prNumber: "51",
  url: "https://github.com/getsentry/sentry/actions/runs/789",
};

function createDeps(
  states: WatchSnapshot[],
): {
  deps: WatchControllerDeps;
  notifications: string[];
  notificationRecords: WatchControllerDeps extends { notify(notification: infer Notification): Promise<void> }
    ? Notification[]
    : never;
  saves: WatchRecord[][];
  suppressionSaves: WatchSuppression[][];
  fetches: WatchTarget[];
  reruns: CheckWatchTarget[];
  openPullRequestFetches: WatchedRepo[];
  activeWorkflowRunFetches: WatchedRepo[];
  defaultBranchFetches: WatchedRepo[];
  userActiveWorkflowRunFetches: WatchedRepo[];
  workflowDefinitionFetches: WatchedRepo[];
} {
  const notifications: string[] = [];
  const notificationRecords: Parameters<WatchControllerDeps["notify"]>[0][] = [];
  const saves: WatchRecord[][] = [];
  const suppressionSaves: WatchSuppression[][] = [];
  const fetches: WatchTarget[] = [];
  const reruns: CheckWatchTarget[] = [];
  const openPullRequestFetches: WatchedRepo[] = [];
  const activeWorkflowRunFetches: WatchedRepo[] = [];
  const defaultBranchFetches: WatchedRepo[] = [];
  const userActiveWorkflowRunFetches: WatchedRepo[] = [];
  const workflowDefinitionFetches: WatchedRepo[] = [];

  return {
    notifications,
    notificationRecords,
    saves,
    suppressionSaves,
    fetches,
    reruns,
    openPullRequestFetches,
    activeWorkflowRunFetches,
    defaultBranchFetches,
    userActiveWorkflowRunFetches,
    workflowDefinitionFetches,
    deps: {
      async fetchState(target) {
        fetches.push(target);
        const state = states.shift();

        if (!state) {
          throw new Error("No fake state queued.");
        }

        return state;
      },
      async notify(notification) {
        notificationRecords.push(notification);
        notifications.push(`${notification.title}: ${notification.body}`);
      },
      async rerunFailed(target) {
        reruns.push(target);
      },
      async fetchOpenPullRequests(target) {
        openPullRequestFetches.push(target);
        return [
          {
            number: "52",
            title: "Improve the tray popup",
            isDraft: false,
            updatedAt: "2026-05-17T12:00:00Z",
            url: "https://github.com/getsentry/sentry/pull/52",
          },
        ];
      },
      async fetchActiveWorkflowRuns(target) {
        activeWorkflowRunFetches.push(target);
        return [
          {
            runId: "123",
            title: "CI: Build",
            workflowName: "CI",
            status: "in_progress",
            branchName: "main",
            updatedAt: "2026-05-17T12:00:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/123",
          },
          {
            runId: "456",
            title: "CodeQL: Analyze",
            workflowName: "CodeQL",
            status: "in_progress",
            branchName: "main",
            updatedAt: "2026-05-17T12:00:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/456",
          },
          {
            runId: "789",
            title: "CI: Build",
            workflowName: "CI",
            status: "in_progress",
            branchName: "feature/tray-popup",
            updatedAt: "2026-05-17T12:00:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/789",
          },
        ];
      },
      async fetchUserActiveWorkflowRuns(target) {
        userActiveWorkflowRunFetches.push(target);
        return [
          {
            runId: "789",
            title: "CI: Build",
            event: "workflow_dispatch",
            workflowName: "CI",
            status: "in_progress",
            branchName: "feature/tray-popup",
            updatedAt: "2026-05-17T12:00:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/789",
          },
          {
            runId: "790",
            title: "CodeQL: Analyze",
            event: "workflow_dispatch",
            workflowName: "CodeQL",
            status: "in_progress",
            branchName: "feature/tray-popup",
            updatedAt: "2026-05-17T12:00:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/790",
          },
        ];
      },
      async fetchRepositoryDefaultBranch(target) {
        defaultBranchFetches.push(target);
        return "main";
      },
      async getAuthenticatedUserLogin() {
        return "jpnurmi";
      },
      async fetchWorkflowDefinitions(target) {
        workflowDefinitionFetches.push(target);
        return [
          {
            name: "CI",
            path: ".github/workflows/ci.yml",
            state: "active",
          },
        ];
      },
      async save(watches) {
        saves.push(watches);
      },
      async saveSuppressions(suppressions) {
        suppressionSaves.push(suppressions);
      },
    },
  };
}

function existingWatch(): WatchRecord {
  return {
    id: "getsentry/sentry/run/123",
    target: runTarget,
    label: "CI: tests",
    status: "completed:success",
    lastSeenStatus: "completed:success",
    lastState: { status: "completed", conclusion: "success" },
    active: false,
    error: undefined,
  };
}

describe("watchController", () => {
  it("publishes a watch with its baseline state without notifying", async () => {
    const { deps, notifications, saves } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "CI: tests",
        timing: {
          queuedAt: "2026-05-16T12:00:00Z",
        },
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps);
    const emittedStatuses: string[][] = [];
    controller.subscribe(() => {
      emittedStatuses.push(controller.getWatches().map((watch) => watch.status));
    });

    await controller.add(runTarget);

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/123",
        status: "queued",
        lastSeenStatus: "queued",
        timing: {
          queuedAt: "2026-05-16T12:00:00Z",
        },
        active: true,
        lastState: { status: "queued", conclusion: null },
      },
    ]);
    expect(notifications).toEqual([]);
    expect(emittedStatuses).toEqual([["queued"]]);
    expect(saves.map((saved) => saved.map((watch) => watch.status))).toEqual([["queued"]]);
  });

  it("moves an explicitly re-added watch back to the inbox", async () => {
    const { deps, fetches } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps, [
      {
        ...existingWatch(),
        triageState: "done",
      },
    ]);

    await controller.add(runTarget);

    expect(fetches).toEqual([runTarget]);
    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/123",
        triageState: "inbox",
        status: "queued",
        active: true,
      },
    ]);
  });

  it("stores pull request references returned by GitHub", async () => {
    const { deps } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "CI: tests",
        prNumber: "51",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(runTarget);

    expect(controller.getWatches()[0].target).toMatchObject({
      prNumber: "51",
    });
  });

  it("adds a workflow watch without resolving job children", async () => {
    const { deps, fetches } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: Fix tests",
        metadata: {
          workflowName: "CI",
          runTitle: "Fix tests",
        },
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(runTarget);

    expect(fetches).toEqual([runTarget]);
    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/123",
        target: runTarget,
        label: "CI: Fix tests",
        metadata: {
          workflowName: "CI",
          runTitle: "Fix tests",
        },
        status: "in_progress",
        lastSeenStatus: "in_progress",
      },
    ]);
  });

  it("adds a pull request watch without resolving workflow runs", async () => {
    const { deps, fetches } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "Pull request #51",
        prNumber: "51",
        url: prTarget.url,
      },
    ]);
    const controller = createWatchController({
      ...deps,
      async fetchPullRequestDetails() {
        return [{ branchName: "feature/flaky-ci", state: "ready", title: "Pull request #51" }];
      },
    });

    await controller.add(prTarget);

    expect(fetches).toEqual([prTarget]);
    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/pull/51",
        target: prTarget,
        sourceState: "ready",
        label: "Pull request #51",
        metadata: { branchName: "feature/flaky-ci", prTitle: "Pull request #51" },
        status: "queued",
        lastSeenStatus: "queued",
      },
    ]);
  });

  it("keeps PR metadata when baseline PR state is loaded", async () => {
    const { deps } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "Fix flaky CI",
        metadata: {
          prTitle: "Fix flaky CI",
        },
        prNumber: "51",
        url: prTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(prTarget);

    expect(controller.getWatches()[0].metadata).toEqual({
      prTitle: "Fix flaky CI",
    });
  });

  it("refreshes PR details during check polling", async () => {
    const { deps } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "Pull request #51",
        prNumber: "51",
        url: prTarget.url,
      },
      {
        status: "in_progress",
        conclusion: null,
        title: "Pull request #51",
        prNumber: "51",
        url: prTarget.url,
      },
    ]);
    const detailFetches: PrWatchTarget[] = [];
    const controller = createWatchController({
      ...deps,
      async fetchPullRequestDetails(targets) {
        detailFetches.push(...targets);
        return targets.map(() => ({ state: "ready" as const, title: "Fix epoch-sized check durations" }));
      },
    });

    await controller.add(prTarget);
    await controller.pollNow();

    expect(detailFetches).toEqual([prTarget, prTarget]);
    expect(controller.getWatches()[0]).toMatchObject({
      label: "Fix epoch-sized check durations",
      sourceState: "ready",
      metadata: {
        prTitle: "Fix epoch-sized check durations",
      },
    });
  });

  it("tracks pull request lifecycle changes", async () => {
    const { deps } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "Pull request #51",
        prNumber: "51",
        url: prTarget.url,
      },
    ]);
    const details = [
      { state: "draft" as const, title: "Refine lifecycle icons" },
      { state: "merged" as const, title: "Refine lifecycle icons" },
    ];
    const controller = createWatchController({
      ...deps,
      async fetchPullRequestDetails() {
        const detail = details.shift();

        if (!detail) {
          throw new Error("No pull request details queued.");
        }

        return [detail];
      },
    });

    await controller.add(prTarget);

    expect(controller.getWatches()[0]).toMatchObject({
      label: "Refine lifecycle icons",
      sourceState: "draft",
    });

    await controller.refreshWatchMetadata();

    expect(controller.getWatches()[0]).toMatchObject({
      label: "Refine lifecycle icons",
      sourceState: "merged",
    });
  });

  it("refreshes pull request details once for associated watches", async () => {
    const { deps } = createDeps([]);
    const detailFetches: PrWatchTarget[] = [];
    const first = {
      ...existingWatch(),
      target: {
        ...runTarget,
        prNumber: "51",
      },
    };
    const second = {
      ...existingWatch(),
      id: "getsentry/sentry/job/456",
      target: {
        ...jobTarget,
        prNumber: "51",
      },
    };
    const done = {
      ...existingWatch(),
      id: "getsentry/sentry/run/789",
      target: {
        ...prRunTarget,
      },
      sourceState: "draft" as const,
      metadata: { prTitle: "Archived title" },
      triageState: "done" as const,
      doneAt: "2026-08-01T12:00:00.000Z",
    };
    const controller = createWatchController(
      {
        ...deps,
        async fetchPullRequestDetails(targets) {
          detailFetches.push(...targets);
          return targets.map(() => ({ state: "closed" as const, title: "Refine lifecycle icons" }));
        },
      },
      [first, second, done],
    );

    await controller.refreshWatchMetadata();

    expect(detailFetches).toEqual([prTarget]);
    expect(controller.getWatches()).toMatchObject([
      {
        source: prTarget,
        sourceState: "closed",
        metadata: { prTitle: "Refine lifecycle icons" },
      },
      {
        source: prTarget,
        sourceState: "closed",
        metadata: { prTitle: "Refine lifecycle icons" },
      },
      {
        sourceState: "draft",
        metadata: { prTitle: "Archived title" },
        triageState: "done",
      },
    ]);
  });

  it("does not save unchanged pull request details again", async () => {
    const { deps, saves } = createDeps([]);
    const controller = createWatchController(
      {
        ...deps,
        async fetchPullRequestDetails(targets) {
          return targets.map(() => ({ state: "ready" as const, title: "Refine lifecycle icons" }));
        },
      },
      [
        {
          ...existingWatch(),
          target: {
            ...runTarget,
            prNumber: "51",
          },
        },
      ],
    );

    await controller.refreshWatchMetadata();
    const saveCount = saves.length;
    await controller.refreshWatchMetadata();

    expect(saves).toHaveLength(saveCount);
  });

  it("reorders watches inside one repository without changing other repository slots", () => {
    const { deps, saves } = createDeps([]);
    const first = existingWatch();
    const otherRepo = {
      ...existingWatch(),
      id: "jpnurmi/gha-watch/run/456",
      target: {
        kind: "run" as const,
        owner: "jpnurmi",
        repo: "gha-watch",
        runId: "456",
        url: "https://github.com/jpnurmi/gha-watch/actions/runs/456",
      },
      label: "Build",
    };
    const second = {
      ...existingWatch(),
      id: "getsentry/sentry/run/789",
      target: {
        kind: "run" as const,
        owner: "getsentry",
        repo: "sentry",
        runId: "789",
        url: "https://github.com/getsentry/sentry/actions/runs/789",
      },
      label: "Lint",
    };
    const controller = createWatchController(deps, [first, otherRepo, second]);

    controller.reorderWithinRepo(first.id, second.id, "after");

    expect(controller.getWatches().map((watch) => watch.id)).toEqual([
      "getsentry/sentry/run/789",
      "jpnurmi/gha-watch/run/456",
      "getsentry/sentry/run/123",
    ]);
    expect(saves.at(-1)?.map((watch) => watch.id)).toEqual([
      "getsentry/sentry/run/789",
      "jpnurmi/gha-watch/run/456",
      "getsentry/sentry/run/123",
    ]);
  });

  it("reorders watch groups inside one repository", () => {
    const { deps, saves } = createDeps([]);
    const first = {
      ...existingWatch(),
      id: "getsentry/sentry/run/101",
      target: {
        kind: "run" as const,
        owner: "getsentry",
        repo: "sentry",
        runId: "101",
        url: "https://github.com/getsentry/sentry/actions/runs/101",
      },
    };
    const firstJob = {
      ...existingWatch(),
      id: "getsentry/sentry/job/102",
      target: {
        kind: "job" as const,
        owner: "getsentry",
        repo: "sentry",
        runId: "101",
        jobId: "102",
        url: "https://github.com/getsentry/sentry/actions/runs/101/job/102",
      },
      sourceRun: first.target,
    };
    const second = {
      ...existingWatch(),
      id: "getsentry/sentry/run/201",
      target: {
        kind: "run" as const,
        owner: "getsentry",
        repo: "sentry",
        runId: "201",
        url: "https://github.com/getsentry/sentry/actions/runs/201",
      },
    };
    const secondJob = {
      ...existingWatch(),
      id: "getsentry/sentry/job/202",
      target: {
        kind: "job" as const,
        owner: "getsentry",
        repo: "sentry",
        runId: "201",
        jobId: "202",
        url: "https://github.com/getsentry/sentry/actions/runs/201/job/202",
      },
      sourceRun: second.target,
    };
    const controller = createWatchController(deps, [first, firstJob, second, secondJob]);

    controller.reorderGroupWithinRepo(["getsentry/sentry/run/201", "getsentry/sentry/job/202"], [
      "getsentry/sentry/run/101",
      "getsentry/sentry/job/102",
    ], "before");

    expect(controller.getWatches().map((watch) => watch.id)).toEqual([
      "getsentry/sentry/run/201",
      "getsentry/sentry/job/202",
      "getsentry/sentry/run/101",
      "getsentry/sentry/job/102",
    ]);
    expect(saves.at(-1)?.map((watch) => watch.id)).toEqual([
      "getsentry/sentry/run/201",
      "getsentry/sentry/job/202",
      "getsentry/sentry/run/101",
      "getsentry/sentry/job/102",
    ]);
  });

  it("loads open pull requests for a repo on demand", async () => {
    const { deps, openPullRequestFetches } = createDeps([]);
    const controller = createWatchController(deps);

    await expect(controller.listOpenPullRequests({ owner: "getsentry", repo: "sentry" })).resolves.toEqual([
      {
        number: "52",
        title: "Improve the tray popup",
        isDraft: false,
        updatedAt: "2026-05-17T12:00:00Z",
        url: "https://github.com/getsentry/sentry/pull/52",
      } satisfies OpenPullRequest,
    ]);
    expect(openPullRequestFetches).toEqual([{ owner: "getsentry", repo: "sentry" }]);
  });

  it("loads active workflow runs for a repo on demand", async () => {
    const { deps, activeWorkflowRunFetches } = createDeps([]);
    const controller = createWatchController(deps);

    await expect(controller.listActiveWorkflowRuns({ owner: "getsentry", repo: "sentry" })).resolves.toEqual([
      {
        runId: "123",
        title: "CI: Build",
        workflowName: "CI",
        status: "in_progress",
        branchName: "main",
        updatedAt: "2026-05-17T12:00:00Z",
        url: "https://github.com/getsentry/sentry/actions/runs/123",
      } satisfies ActiveWorkflowRun,
      {
        runId: "456",
        title: "CodeQL: Analyze",
        workflowName: "CodeQL",
        status: "in_progress",
        branchName: "main",
        updatedAt: "2026-05-17T12:00:00Z",
        url: "https://github.com/getsentry/sentry/actions/runs/456",
      } satisfies ActiveWorkflowRun,
      {
        runId: "789",
        title: "CI: Build",
        workflowName: "CI",
        status: "in_progress",
        branchName: "feature/tray-popup",
        updatedAt: "2026-05-17T12:00:00Z",
        url: "https://github.com/getsentry/sentry/actions/runs/789",
      } satisfies ActiveWorkflowRun,
    ]);
    expect(activeWorkflowRunFetches).toEqual([{ owner: "getsentry", repo: "sentry" }]);
  });

  it("loads workflow definitions for a repo on demand", async () => {
    const { deps, workflowDefinitionFetches } = createDeps([]);
    const controller = createWatchController(deps);

    await expect(controller.listWorkflowDefinitions({ owner: "getsentry", repo: "sentry" })).resolves.toEqual([
      {
        name: "CI",
        path: ".github/workflows/ci.yml",
        state: "active",
      } satisfies WorkflowDefinition,
    ]);
    expect(workflowDefinitionFetches).toEqual([{ owner: "getsentry", repo: "sentry" }]);
  });

  it("subscribes to selected default branch workflow runs", async () => {
    const { deps, activeWorkflowRunFetches, defaultBranchFetches, openPullRequestFetches } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: Build",
        metadata: {
          workflowName: "CI",
          branchName: "main",
        },
        url: "https://github.com/getsentry/sentry/actions/runs/123",
      },
    ]);
    const controller = createWatchController(deps);

    await controller.syncWorkflowSubscriptions([
      {
        owner: "getsentry",
        repo: "sentry",
        defaultBranchWorkflowNames: ["CI"],
      },
    ]);

    expect(activeWorkflowRunFetches).toEqual([{ owner: "getsentry", repo: "sentry", defaultBranchWorkflowNames: ["CI"] }]);
    expect(defaultBranchFetches).toEqual([{ owner: "getsentry", repo: "sentry", defaultBranchWorkflowNames: ["CI"] }]);
    expect(openPullRequestFetches).toEqual([]);
    expect(controller.getWatches().map((watch) => watch.id)).toEqual(["getsentry/sentry/run/123"]);
  });

  it("does not reopen done watches while syncing subscriptions", async () => {
    const { deps, fetches } = createDeps([]);
    const controller = createWatchController(deps, [
      {
        ...existingWatch(),
        triageState: "done",
      },
    ]);

    await controller.syncWorkflowSubscriptions([
      {
        owner: "getsentry",
        repo: "sentry",
        defaultBranchWorkflowNames: ["CI"],
      },
    ]);

    expect(fetches).toEqual([]);
    expect(controller.getWatches()[0].triageState).toBe("done");
  });

  it("does not reopen cleared watches while syncing subscriptions", async () => {
    const { deps, fetches } = createDeps([]);
    const controller = createWatchController(
      deps,
      [],
      [
        {
          id: "getsentry/sentry/run/123",
          clearedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    );

    await controller.syncWorkflowSubscriptions([
      {
        owner: "getsentry",
        repo: "sentry",
        defaultBranchWorkflowNames: ["CI"],
      },
    ]);

    expect(fetches).toEqual([]);
    expect(controller.getWatches()).toEqual([]);
  });

  it("allows subscription sync after a suppression expires", async () => {
    let now = new Date("2026-05-01T00:00:00Z");
    const { deps, suppressionSaves } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(
      {
        ...deps,
        now: () => now,
      },
      [],
      [
        {
          id: "getsentry/sentry/run/123",
          clearedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    );
    now = new Date("2026-07-01T00:00:00Z");

    await controller.syncWorkflowSubscriptions([
      {
        owner: "getsentry",
        repo: "sentry",
        defaultBranchWorkflowNames: ["CI"],
      },
    ]);

    expect(controller.getWatches().map((watch) => watch.id)).toEqual([
      "getsentry/sentry/run/123",
    ]);
    expect(suppressionSaves.at(-1)).toEqual([]);
  });

  it("lets a manual add override a cleared-watch suppression", async () => {
    const { deps, fetches, suppressionSaves } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(
      deps,
      [],
      [
        {
          id: "getsentry/sentry/run/123",
          clearedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    );

    await controller.add(runTarget);

    expect(fetches).toEqual([runTarget]);
    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/123",
      },
    ]);
    expect(suppressionSaves.at(-1)).toEqual([]);
  });

  it("subscribes to selected manually dispatched runs on non-PR branches", async () => {
    const { deps, userActiveWorkflowRunFetches } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: Build",
        metadata: {
          workflowName: "CI",
          branchName: "feature/tray-popup",
        },
        url: "https://github.com/getsentry/sentry/actions/runs/789",
      },
    ]);
    const controller = createWatchController(deps);

    await controller.syncWorkflowSubscriptions([
      {
        owner: "getsentry",
        repo: "sentry",
        userWorkflowNames: ["CI"],
      },
    ]);

    expect(userActiveWorkflowRunFetches).toEqual([{ owner: "getsentry", repo: "sentry", userWorkflowNames: ["CI"] }]);
    expect(controller.getWatches().map((watch) => watch.id)).toEqual(["getsentry/sentry/run/789"]);
  });

  it("reuses a tracked PR without overwriting its active aggregate state", async () => {
    const subscribedRunSnapshot = {
      status: "in_progress",
      conclusion: null,
      title: "CI: Refine lifecycle icons",
      metadata: {
        workflowName: "CI",
        runTitle: "Refine lifecycle icons",
      },
      prNumber: "51",
      url: prRunTarget.url,
    };
    const { deps, fetches, notifications, saves } = createDeps([
      subscribedRunSnapshot,
      {
        status: "in_progress",
        conclusion: null,
        hasFailedChildren: true,
        title: "Pull request #51",
        prNumber: "51",
        url: prTarget.url,
      },
      subscribedRunSnapshot,
    ]);
    const controller = createWatchController(deps, [
      {
        id: "getsentry/sentry/pull/51",
        target: prTarget,
        sourceState: "ready",
        label: "Refine lifecycle icons",
        metadata: { prTitle: "Refine lifecycle icons", branchName: "feature/tray-popup" },
        status: "completed:success",
        lastSeenStatus: "completed:success",
        lastState: { status: "completed", conclusion: "success" },
        active: false,
        error: undefined,
      },
    ]);
    const emittedWatchIds: string[][] = [];
    controller.subscribe(() => {
      emittedWatchIds.push(controller.getWatches().map((watch) => watch.id));
    });

    await controller.syncWorkflowSubscriptions([
      {
        owner: "getsentry",
        repo: "sentry",
        userWorkflowNames: ["CI"],
      },
    ]);

    expect(fetches).toMatchObject([{ kind: "run", runId: "789" }]);
    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/pull/51",
        target: prTarget,
        label: "Refine lifecycle icons",
        metadata: { prTitle: "Refine lifecycle icons" },
        status: "in_progress",
        lastSeenStatus: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
        active: true,
      },
    ]);

    await controller.pollNow();
    await controller.syncWorkflowSubscriptions([
      {
        owner: "getsentry",
        repo: "sentry",
        userWorkflowNames: ["CI"],
      },
    ]);

    expect(fetches).toMatchObject([
      { kind: "run", runId: "789" },
      { kind: "pr", prNumber: "51" },
    ]);
    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/pull/51",
        status: "in_progress:failure",
        lastSeenStatus: "in_progress",
        lastState: { status: "in_progress", conclusion: null, hasFailedChildren: true },
        active: true,
      },
    ]);
    expect(notifications).toEqual([]);
    expect(saves.every((saved) => saved.every((watch) => watch.id !== "getsentry/sentry/run/789"))).toBe(true);
    expect(emittedWatchIds.every((ids) => !ids.includes("getsentry/sentry/run/789"))).toBe(true);
  });

  it("automatically watches authored PRs instead of dispatch runs on their branches", async () => {
    const branchName = "jpnurmi/feat/integration-names";
    const pullRequestTarget = {
      kind: "pr",
      owner: "getsentry",
      repo: "sentry-native",
      prNumber: "1969",
      url: "https://github.com/getsentry/sentry-native/pull/1969",
    } as const;
    const { deps, fetches } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "Pull request #1969",
        prNumber: "1969",
        url: pullRequestTarget.url,
      },
    ]);
    deps.fetchOpenPullRequests = async () => [
      {
        number: "1969",
        title: "feat: report SDK integrations",
        isDraft: false,
        authorLogin: "jpnurmi",
        headBranch: branchName,
        updatedAt: "2026-08-10T12:54:47Z",
        url: pullRequestTarget.url,
      },
      {
        number: "1972",
        title: "Respect consent for external crash reporters",
        isDraft: false,
        authorLogin: "octocat",
        headBranch: "octocat/fix/crashpad-consent",
        updatedAt: "2026-08-10T15:58:03Z",
        url: "https://github.com/getsentry/sentry-native/pull/1972",
      },
    ];
    deps.fetchUserActiveWorkflowRuns = async () => [
      {
        runId: "31372026291",
        title: "CI: feat: report SDK integrations",
        event: "workflow_dispatch",
        workflowName: "CI",
        status: "in_progress",
        branchName,
        url: "https://github.com/getsentry/sentry-native/actions/runs/31372026291",
      },
    ];
    const controller = createWatchController(deps);

    await controller.syncWorkflowSubscriptions([
      {
        owner: "getsentry",
        repo: "sentry-native",
        pullRequestScope: "user",
      },
    ]);
    await controller.syncWorkflowSubscriptions([
      {
        owner: "getsentry",
        repo: "sentry-native",
        userWorkflowNames: ["CI"],
      },
    ]);

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry-native/pull/1969",
        target: pullRequestTarget,
        label: "feat: report SDK integrations",
        metadata: {
          prTitle: "feat: report SDK integrations",
          prUpdatedAt: "2026-08-10T12:54:47Z",
          branchName,
        },
        status: "in_progress",
        lastSeenStatus: "in_progress",
        active: true,
      },
    ]);
    expect(fetches).toEqual([pullRequestTarget]);
  });

  it("automatically watches every open PR in all scope", async () => {
    const { deps, fetches } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "Pull request #51",
        prNumber: "51",
        url: prTarget.url,
      },
      {
        status: "completed",
        conclusion: "success",
        title: "Pull request #52",
        prNumber: "52",
        url: "https://github.com/getsentry/sentry/pull/52",
      },
    ]);
    deps.fetchOpenPullRequests = async () => [
      {
        number: "51",
        title: "Improve the tray popup",
        isDraft: false,
        authorLogin: "jpnurmi",
        updatedAt: "2026-05-17T12:00:00Z",
        url: prTarget.url,
      },
      {
        number: "52",
        title: "Fix Windows notifications",
        isDraft: false,
        authorLogin: "octocat",
        updatedAt: "2026-05-17T13:00:00Z",
        url: "https://github.com/getsentry/sentry/pull/52",
      },
    ];
    deps.getAuthenticatedUserLogin = undefined;
    const controller = createWatchController(deps);

    await controller.syncWorkflowSubscriptions([
      {
        owner: "getsentry",
        repo: "sentry",
        pullRequestScope: "all",
      },
    ]);

    expect(controller.getWatches().map((watch) => watch.id)).toEqual([
      "getsentry/sentry/pull/51",
      "getsentry/sentry/pull/52",
    ]);
    expect(fetches).toMatchObject([
      { kind: "pr", prNumber: "51" },
      { kind: "pr", prNumber: "52" },
    ]);
  });

  it("rechecks inactive authored PRs when workflow reruns do not update the PR", async () => {
    const pullRequestTarget = {
      kind: "pr",
      owner: "getsentry",
      repo: "sentry-native",
      prNumber: "1972",
      url: "https://github.com/getsentry/sentry-native/pull/1972",
    } as const;
    const updatedAt = "2026-08-10T15:58:03Z";
    const { deps, fetches } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "Pull request #1972",
        prNumber: "1972",
        url: pullRequestTarget.url,
      },
    ]);
    deps.fetchOpenPullRequests = async () => [
      {
        number: "1972",
        title: "fix(crashpad): Respect consent for external crash reporters",
        isDraft: false,
        authorLogin: "jpnurmi",
        headBranch: "jpnurmi/fix/crashpad-consent",
        updatedAt,
        url: pullRequestTarget.url,
      },
    ];
    const controller = createWatchController(deps, [
      {
        id: "getsentry/sentry-native/pull/1972",
        target: pullRequestTarget,
        sourceState: "ready",
        label: "fix(crashpad): Respect consent for external crash reporters",
        metadata: {
          prTitle: "fix(crashpad): Respect consent for external crash reporters",
          prUpdatedAt: updatedAt,
          branchName: "jpnurmi/fix/crashpad-consent",
        },
        status: "completed:failure",
        lastSeenStatus: "completed:failure",
        lastState: { status: "completed", conclusion: "failure" },
        active: false,
        error: undefined,
      },
    ]);

    await controller.syncWorkflowSubscriptions([
      {
        owner: "getsentry",
        repo: "sentry-native",
        pullRequestScope: "user",
      },
    ]);

    expect(fetches).toEqual([pullRequestTarget]);
    expect(controller.getWatches()[0]).toMatchObject({
      status: "in_progress",
      lastSeenStatus: "in_progress",
      lastState: { status: "in_progress", conclusion: null },
      active: true,
    });
  });

  it("leaves saved authored PRs parked during subscription sync", async () => {
    const pullRequestTarget = {
      kind: "pr",
      owner: "getsentry",
      repo: "sentry-native",
      prNumber: "1972",
      url: "https://github.com/getsentry/sentry-native/pull/1972",
    } as const;
    const savedWatch: WatchRecord = {
      id: "getsentry/sentry-native/pull/1972",
      target: pullRequestTarget,
      sourceState: "ready",
      label: "WIP: Respect consent",
      metadata: {
        prTitle: "WIP: Respect consent",
        prUpdatedAt: "2026-08-10T15:58:03Z",
        branchName: "jpnurmi/fix/crashpad-consent",
      },
      status: "completed:failure",
      lastSeenStatus: "completed:failure",
      lastState: { status: "completed", conclusion: "failure" },
      triageState: "saved",
      active: false,
      error: undefined,
    };
    const { deps, fetches } = createDeps([]);
    deps.fetchOpenPullRequests = async () => [
      {
        number: "1972",
        title: "Respect consent for external crash reporters",
        isDraft: false,
        authorLogin: "jpnurmi",
        headBranch: "jpnurmi/fix/crashpad-consent",
        updatedAt: "2026-08-10T16:30:00Z",
        url: pullRequestTarget.url,
      },
    ];
    const controller = createWatchController(deps, [savedWatch]);

    await controller.syncWorkflowSubscriptions([
      {
        owner: "getsentry",
        repo: "sentry-native",
        pullRequestScope: "user",
      },
    ]);

    expect(fetches).toEqual([]);
    expect(controller.getWatches()).toEqual([savedWatch]);
  });

  it("requires a workflow run listing dependency before loading active workflow runs", async () => {
    const { deps } = createDeps([]);
    const controller = createWatchController({ ...deps, fetchActiveWorkflowRuns: undefined });

    await expect(controller.listActiveWorkflowRuns({ owner: "getsentry", repo: "sentry" })).rejects.toThrow(
      "Active workflow run lists need GitHub run listing support.",
    );
  });

  it("requires a pull request listing dependency before loading open pull requests", async () => {
    const { deps } = createDeps([]);
    const controller = createWatchController({ ...deps, fetchOpenPullRequests: undefined });

    await expect(controller.listOpenPullRequests({ owner: "getsentry", repo: "sentry" })).rejects.toThrow(
      "Open pull request lists need GitHub PR listing support.",
    );
  });

  it("refreshes missing pull request references for existing inactive watches", async () => {
    const { deps, notifications } = createDeps([
      {
        status: "completed",
        conclusion: "success",
        title: "CI: tests",
        prNumber: "51",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps, [existingWatch()]);

    await controller.refreshWatchMetadata();

    expect(controller.getWatches()[0].target).toMatchObject({
      prNumber: "51",
    });
    expect(notifications).toEqual([]);
  });

  it("hydrates inactive watches without a PR reference only once", async () => {
    const { deps, fetches } = createDeps([
      {
        status: "completed",
        conclusion: "success",
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps, [existingWatch()]);

    await controller.refreshWatchMetadata();
    await controller.refreshWatchMetadata();

    expect(fetches).toEqual([runTarget]);
  });

  it("does not repoll a legacy watch reactivated by hydration", async () => {
    const { deps, fetches } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps, [existingWatch()]);

    await controller.pollNow();

    expect(fetches).toEqual([runTarget]);
    expect(controller.getWatches()[0].active).toBe(true);
  });

  it("hydrates an inactive Done watch after it returns to Inbox", async () => {
    const { deps, fetches } = createDeps([
      {
        status: "completed",
        conclusion: "success",
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(
      { ...deps, now: () => new Date("2026-08-09T00:00:00.000Z") },
      [
        {
          ...existingWatch(),
          triageState: "done",
          doneAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    );

    await controller.refreshWatchMetadata();
    controller.setTriageState([existingWatch().id], "inbox");
    await controller.refreshWatchMetadata();

    expect(fetches).toEqual([runTarget]);
  });

  it("leaves active metadata hydration to the regular poll", async () => {
    const { deps, fetches } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps, [
      {
        ...existingWatch(),
        status: "in_progress",
        lastSeenStatus: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
        active: true,
      },
    ]);

    await controller.refreshWatchMetadata();
    await controller.pollNow();

    expect(fetches).toEqual([runTarget]);
  });

  it("does not notify when a watched status changes to in progress", async () => {
    const { deps, notifications } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(runTarget);
    await controller.pollNow();

    expect(notifications).toEqual([]);
  });

  it("does not notify status changes while notifications are paused", async () => {
    const { deps, notifications } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
      {
        status: "completed",
        conclusion: "success",
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController({
      ...deps,
      notificationsPaused: () => true,
    });

    await controller.add(runTarget);
    await controller.pollNow();

    expect(notifications).toEqual([]);
    expect(controller.getWatches()).toMatchObject([
      {
        status: "completed:success",
        lastSeenStatus: "in_progress",
        active: false,
      },
    ]);
  });

  it("does not automatically refresh saved watches", async () => {
    const { deps, fetches, notificationRecords } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
      {
        status: "completed",
        conclusion: "failure",
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(runTarget);
    controller.setTriageState(["getsentry/sentry/run/123"], "saved");
    await controller.pollNow();

    expect(notificationRecords).toEqual([]);
    expect(fetches).toEqual([runTarget]);
    expect(controller.getWatches()).toMatchObject([
      {
        triageState: "saved",
        status: "in_progress",
        active: true,
      },
    ]);
  });

  it("refreshes saved watches on demand without notifying", async () => {
    const { deps, notificationRecords } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
      {
        status: "completed",
        conclusion: "failure",
        title: "CI: tests",
        url: runTarget.url,
      },
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(runTarget);
    controller.setTriageState(["getsentry/sentry/run/123"], "saved");
    await controller.pollNow({ triageState: "saved", includeInactive: true });

    expect(notificationRecords).toEqual([]);
    expect(controller.getWatches()).toMatchObject([
      {
        triageState: "saved",
        status: "completed:failure",
        active: false,
      },
    ]);

    await controller.pollNow({ triageState: "saved", includeInactive: true });

    expect(controller.getWatches()).toMatchObject([
      {
        triageState: "saved",
        status: "in_progress",
        active: true,
      },
    ]);
  });

  it("includes repo, status, and timing details in status change notifications", async () => {
    const { deps, notificationRecords } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: tests",
        timing: {
          startedAt: "2026-05-16T12:02:00Z",
        },
        url: runTarget.url,
      },
      {
        status: "completed",
        conclusion: "success",
        title: "CI: tests",
        timing: {
          startedAt: "2026-05-16T12:02:00Z",
          completedAt: "2026-05-16T12:09:00Z",
        },
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController({
      ...deps,
      now: () => new Date("2026-05-16T12:10:00Z"),
    });

    await controller.add(runTarget);
    await controller.pollNow();

    expect(notificationRecords).toEqual([
      {
        watchId: "getsentry/sentry/run/123",
        title: "CI: tests",
        url: "https://github.com/getsentry/sentry/actions/runs/123",
        body:
          "getsentry/sentry\n" +
          "Successful - This check was successful.\n" +
          "Completed 1m ago · 7m",
        largeBody:
          "getsentry/sentry\n" +
          "Successful - This check was successful.\n" +
          "Completed 1m ago · 7m",
        persistent: false,
        timeoutMs: 15_000,
        summary: "getsentry/sentry",
        group: "getsentry/sentry",
      },
    ]);
  });

  it("still notifies status changes for directly watched jobs", async () => {
    const { deps, notificationRecords } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: macOS",
        url: jobTarget.url,
      },
      {
        status: "completed",
        conclusion: "success",
        title: "CI: macOS",
        url: jobTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(jobTarget);
    await controller.pollNow();

    expect(notificationRecords).toMatchObject([
      {
        watchId: "getsentry/sentry/job/456",
        title: "CI: macOS",
        url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
      },
    ]);
  });

  it("stops polling done watches", async () => {
    const { deps, fetches } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(runTarget);
    controller.setTriageState(["getsentry/sentry/run/123"], "done");
    await controller.pollNow();

    expect(fetches).toHaveLength(1);
    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/123",
        triageState: "done",
      },
    ]);
  });

  it("clears Done watches on demand", () => {
    const { deps, suppressionSaves } = createDeps([]);
    const controller = createWatchController(deps, [
      {
        ...existingWatch(),
        triageState: "done",
        doneAt: "2026-07-01T00:00:00.000Z",
      },
      {
        ...existingWatch(),
        id: "getsentry/sentry/run/saved",
        triageState: "saved",
      },
    ]);

    controller.clearDone(["getsentry/sentry/run/123"]);

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/saved",
        triageState: "saved",
      },
    ]);
    expect(suppressionSaves.at(-1)).toEqual([
      {
        id: "getsentry/sentry/run/123",
        clearedAt: expect.any(String),
      },
    ]);
  });

  it("clears Done watches after five months", () => {
    const { deps, saves, suppressionSaves } = createDeps([]);
    const controller = createWatchController(
      {
        ...deps,
        now: () => new Date("2026-08-02T00:00:00Z"),
      },
      [
        {
          ...existingWatch(),
          id: "expired",
          triageState: "done",
          doneAt: "2026-03-01T00:00:00.000Z",
        },
        {
          ...existingWatch(),
          id: "recent",
          triageState: "done",
          doneAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    );

    expect(controller.getWatches().map((watch) => watch.id)).toEqual(["recent"]);
    expect(saves.at(-1)?.map((watch) => watch.id)).toEqual(["recent"]);
    expect(suppressionSaves.at(-1)).toEqual([
      {
        id: "expired",
        clearedAt: "2026-08-02T00:00:00.000Z",
      },
    ]);
  });

  it("marks all watches in the selected view done", async () => {
    const { deps } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps, [
      {
        ...existingWatch(),
        id: "getsentry/sentry/run/saved",
        triageState: "saved",
      },
    ]);

    await controller.add(runTarget);
    controller.markAllDone("inbox");

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/saved",
        triageState: "saved",
      },
      {
        id: "getsentry/sentry/run/123",
        triageState: "done",
      },
    ]);
  });

  it("marks only finished watches done", async () => {
    const { deps } = createDeps([
      {
        status: "completed",
        conclusion: "success",
        title: "CI: tests",
        url: runTarget.url,
      },
      {
        status: "queued",
        conclusion: null,
        title: "CI: job",
        url: jobTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(runTarget);
    await controller.add(jobTarget);
    controller.markFinishedDone("inbox");

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/123",
        active: false,
        triageState: "done",
      },
      {
        id: "getsentry/sentry/job/456",
        active: true,
      },
    ]);
  });

  it("marks completed watches inactive after polling", async () => {
    const { deps } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
      {
        status: "completed",
        conclusion: "success",
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(runTarget);
    await controller.pollNow();

    expect(controller.getWatches()).toMatchObject([
      {
        status: "completed:success",
        lastSeenStatus: "in_progress",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      },
    ]);
  });

  it("marks a status change seen when requested", async () => {
    const { deps } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
      {
        status: "completed",
        conclusion: "success",
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(runTarget);
    await controller.pollNow();
    controller.markSeen("getsentry/sentry/run/123");

    expect(controller.getWatches()).toMatchObject([
      {
        status: "completed:success",
        lastSeenStatus: "completed:success",
      },
    ]);
  });

  it("marks a direct PR status change seen from its notification id", () => {
    const controller = createWatchController(createDeps([]).deps, [
      {
        id: "getsentry/sentry/pull/51",
        target: prTarget,
        sourceState: "ready",
        label: "Pull request #51",
        status: "completed:success",
        lastSeenStatus: "in_progress",
        lastState: { status: "completed", conclusion: "success" },
        active: false,
        error: undefined,
      },
    ]);

    controller.markSeen("getsentry/sentry/pull/51");

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/pull/51",
        lastSeenStatus: "completed:success",
      },
    ]);
  });

  it("marks all status changes seen when requested", async () => {
    const { deps } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: job",
        url: jobTarget.url,
      },
      {
        status: "completed",
        conclusion: "success",
        title: "CI: tests",
        url: runTarget.url,
      },
      {
        status: "completed",
        conclusion: "failure",
        title: "CI: job",
        url: jobTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(runTarget);
    await controller.add(jobTarget);
    await controller.pollNow();
    controller.markAllSeen();

    expect(controller.getWatches()).toMatchObject([
      {
        status: "completed:success",
        lastSeenStatus: "completed:success",
      },
      {
        status: "completed:failure",
        lastSeenStatus: "completed:failure",
      },
    ]);
  });

  it("normalizes existing watches without seen status as seen on startup", () => {
    const { deps } = createDeps([]);
    const controller = createWatchController(deps, [
      {
        id: "getsentry/sentry/run/123",
        target: runTarget,
        label: "CI: tests",
        status: "completed:success",
        lastState: { status: "completed", conclusion: "success" },
        active: false,
        error: undefined,
      },
    ]);

    expect(controller.getWatches()).toMatchObject([
      {
        status: "completed:success",
        lastSeenStatus: "completed:success",
      },
    ]);
  });

  it("uses the fetched job name as the watch label", async () => {
    const { deps } = createDeps([
      {
        status: "in_progress",
        conclusion: null,
        title: "CI: test (macos)",
        url: jobTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(jobTarget);

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/job/456",
        label: "CI: test (macos)",
      },
    ]);
  });

  it("refreshes repository icons once per repository", async () => {
    const { deps } = createDeps([]);
    let fetches = 0;
    const controller = createWatchController(
      {
        ...deps,
        async fetchRepositoryIconUrl(target) {
          fetches += 1;
          expect(target).toBe(runTarget);
          return "https://avatars.githubusercontent.com/u/1396951?v=4";
        },
      },
      [existingWatch(), { ...existingWatch(), id: "getsentry/sentry/job/456", target: jobTarget }],
    );

    await controller.refreshRepositoryIcons();

    expect(fetches).toBe(1);
    expect(controller.getWatches()).toMatchObject([
      {
        repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
      },
      {
        repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
      },
    ]);
  });

  it("reuses a stored icon for other watches in the repository", async () => {
    const { deps } = createDeps([]);
    const controller = createWatchController(
      {
        ...deps,
        async fetchRepositoryIconUrl() {
          throw new Error("The stored icon should be reused.");
        },
      },
      [
        {
          ...existingWatch(),
          repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
        },
        { ...existingWatch(), id: "getsentry/sentry/job/456", target: jobTarget },
      ],
    );

    await controller.refreshRepositoryIcons();

    expect(controller.getWatches()[1].repoIconUrl).toBe("https://avatars.githubusercontent.com/u/1396951?v=4");
  });

  it("reruns failed jobs for an existing watch", async () => {
    const { deps, reruns } = createDeps([]);
    const controller = createWatchController(deps, [
      {
        ...existingWatch(),
        status: "completed:failure",
        lastState: { status: "completed", conclusion: "failure" },
      },
    ]);

    await controller.rerunFailed("getsentry/sentry/run/123");

    expect(reruns).toEqual([runTarget]);
  });
});
