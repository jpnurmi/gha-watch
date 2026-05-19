import { describe, expect, it } from "vitest";
import { createWatchController, type WatchControllerDeps } from "./watchController";
import type { CheckWatchTarget, JobWatchTarget, PrWatchTarget, RunWatchTarget } from "../domain/githubUrl";
import type { FavoriteRepo } from "../domain/favorites";
import { getWatchId, type PrWatchResolution, type RunWatchResolution, type WatchRecord } from "../domain/watches";
import type { ActiveWorkflowRun, OpenPullRequest, WatchSnapshot } from "../platform/gh";

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

type TestPrWatchResolution = CheckWatchTarget[] | PrWatchResolution;
type TestRunWatchResolution = JobWatchTarget[] | RunWatchResolution;

function createDeps(
  states: WatchSnapshot[],
  prResolutions: TestPrWatchResolution[] = [],
  runResolutions?: TestRunWatchResolution[],
): {
  deps: WatchControllerDeps;
  notifications: string[];
  notificationRecords: WatchControllerDeps extends { notify(notification: infer Notification): Promise<void> }
    ? Notification[]
    : never;
  saves: WatchRecord[][];
  fetches: CheckWatchTarget[];
  reruns: CheckWatchTarget[];
  prResolves: PrWatchTarget[];
  runResolves: RunWatchTarget[];
  openPullRequestFetches: FavoriteRepo[];
  activeWorkflowRunFetches: FavoriteRepo[];
} {
  const notifications: string[] = [];
  const notificationRecords: Parameters<WatchControllerDeps["notify"]>[0][] = [];
  const saves: WatchRecord[][] = [];
  const fetches: CheckWatchTarget[] = [];
  const reruns: CheckWatchTarget[] = [];
  const prResolves: PrWatchTarget[] = [];
  const runResolves: RunWatchTarget[] = [];
  const openPullRequestFetches: FavoriteRepo[] = [];
  const activeWorkflowRunFetches: FavoriteRepo[] = [];

  return {
    notifications,
    notificationRecords,
    saves,
    fetches,
    reruns,
    prResolves,
    runResolves,
    openPullRequestFetches,
    activeWorkflowRunFetches,
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
      async resolvePrWatchTargets(target) {
        prResolves.push(target);
        const targets = prResolutions.shift();

        if (!targets) {
          throw new Error("No fake PR resolution queued.");
        }

        return Array.isArray(targets) ? { targets, sourceState: "ready" } : targets;
      },
      ...(runResolutions
        ? {
            async resolveRunWatchTargets(target: RunWatchTarget) {
              runResolves.push(target);
              const targets = runResolutions.shift();

              if (!targets) {
                throw new Error("No fake run resolution queued.");
              }

              return Array.isArray(targets) ? { targets } : targets;
            },
          }
        : {}),
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
            status: "in_progress",
            updatedAt: "2026-05-17T12:00:00Z",
            url: "https://github.com/getsentry/sentry/actions/runs/123",
          },
        ];
      },
      async save(watches) {
        saves.push(watches);
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
  it("adds a watch and fetches baseline state without notifying", async () => {
    const { deps, notifications } = createDeps([
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

  it("adds a workflow watch as a run scope with resolved job children", async () => {
    const linuxJobTarget: JobWatchTarget = {
      kind: "job",
      owner: "getsentry",
      repo: "sentry",
      runId: "123",
      jobId: "456",
      url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
    };
    const windowsJobTarget: JobWatchTarget = {
      kind: "job",
      owner: "getsentry",
      repo: "sentry",
      runId: "123",
      jobId: "789",
      url: "https://github.com/getsentry/sentry/actions/runs/123/job/789",
    };
    const { deps, fetches, runResolves } = createDeps(
      [
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
        {
          status: "completed",
          conclusion: "success",
          title: "CI: Linux",
          metadata: {
            workflowName: "CI",
            jobName: "Linux",
          },
          url: linuxJobTarget.url,
        },
        {
          status: "queued",
          conclusion: null,
          title: "CI: Windows",
          metadata: {
            workflowName: "CI",
            jobName: "Windows",
          },
          url: windowsJobTarget.url,
        },
      ],
      [],
      [
        {
          targets: [linuxJobTarget, windowsJobTarget],
          targetMetadata: {
            [getWatchId(linuxJobTarget)]: { jobName: "Linux" },
            [getWatchId(windowsJobTarget)]: { jobName: "Windows" },
          },
        },
      ],
    );
    const controller = createWatchController(deps);

    await controller.add(runTarget);

    expect(runResolves).toEqual([runTarget]);
    expect(fetches).toEqual([runTarget, linuxJobTarget, windowsJobTarget]);
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
      {
        id: "getsentry/sentry/job/456",
        target: linuxJobTarget,
        sourceRun: runTarget,
        label: "CI: Linux",
        status: "completed:success",
        lastSeenStatus: "completed:success",
      },
      {
        id: "getsentry/sentry/job/789",
        target: windowsJobTarget,
        sourceRun: runTarget,
        label: "CI: Windows",
        status: "queued",
        lastSeenStatus: "queued",
      },
    ]);
  });

  it("adds a live PR watch as the PR's current run watches", async () => {
    const { deps, fetches, prResolves } = createDeps(
      [
        {
          status: "queued",
          conclusion: null,
          title: "CI: tests",
          prNumber: "51",
          url: prRunTarget.url,
        },
      ],
      [[prRunTarget]],
    );
    const controller = createWatchController(deps);

    await controller.add(prTarget);

    expect(prResolves).toEqual([prTarget]);
    expect(fetches).toEqual([prRunTarget]);
    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/789",
        target: prRunTarget,
        source: prTarget,
        sourceState: "ready",
        label: "CI: tests",
        status: "queued",
        lastSeenStatus: "queued",
      },
    ]);
  });

  it("keeps PR title metadata when baseline job state is loaded", async () => {
    const prJobTarget: CheckWatchTarget = {
      ...jobTarget,
      prNumber: "51",
    };
    const { deps } = createDeps(
      [
        {
          status: "queued",
          conclusion: null,
          title: "CI: macOS",
          metadata: {
            workflowName: "CI",
            jobName: "macOS",
          },
          url: prJobTarget.url,
        },
      ],
      [
        {
          sourceState: "ready",
          targets: [prJobTarget],
          targetMetadata: {
            [getWatchId(prJobTarget)]: {
              prTitle: "Fix flaky CI",
              workflowName: "CI",
              jobName: "macOS",
            },
          },
        },
      ],
    );
    const controller = createWatchController(deps);

    await controller.add(prTarget);

    expect(controller.getWatches()[0].metadata).toEqual({
      prTitle: "Fix flaky CI",
      workflowName: "CI",
      jobName: "macOS",
    });
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
        status: "in_progress",
        updatedAt: "2026-05-17T12:00:00Z",
        url: "https://github.com/getsentry/sentry/actions/runs/123",
      } satisfies ActiveWorkflowRun,
    ]);
    expect(activeWorkflowRunFetches).toEqual([{ owner: "getsentry", repo: "sentry" }]);
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

  it("replaces old PR source watches when the PR head gets new runs", async () => {
    const oldWatch: WatchRecord = {
      id: "getsentry/sentry/run/123",
      target: runTarget,
      source: prTarget,
      label: "CI: old",
      status: "completed:cancelled",
      lastSeenStatus: "completed:cancelled",
      lastState: { status: "completed", conclusion: "cancelled" },
      active: false,
      error: undefined,
    };
    const { deps, notifications } = createDeps(
      [
        {
          status: "in_progress",
          conclusion: null,
          title: "CI: tests",
          prNumber: "51",
          url: prRunTarget.url,
        },
      ],
      [[prRunTarget]],
    );
    const controller = createWatchController(deps, [oldWatch]);

    await controller.pollNow();

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/789",
        source: prTarget,
        sourceState: "ready",
        status: "in_progress",
      },
    ]);
    expect(notifications).toEqual([]);
  });

  it("auto-clears live PR watches when their source PR is merged and the option is enabled", async () => {
    const mergedWatch: WatchRecord = {
      id: "getsentry/sentry/run/789",
      target: prRunTarget,
      source: prTarget,
      label: "CI",
      status: "in_progress",
      lastSeenStatus: "in_progress",
      lastState: { status: "in_progress", conclusion: null },
      active: true,
      error: undefined,
    };
    const { deps, fetches } = createDeps([], [{ targets: [], sourceState: "merged" }]);
    const controller = createWatchController(deps, [mergedWatch], {
      autoClearMergedPrWatches: true,
    });

    await controller.pollNow();

    expect(fetches).toEqual([]);
    expect(controller.getWatches()).toEqual([]);
  });

  it("updates PR source state without replacing current run watches", async () => {
    const oldWatch: WatchRecord = {
      id: "getsentry/sentry/run/789",
      target: prRunTarget,
      source: prTarget,
      sourceState: "draft",
      label: "CI",
      status: "queued",
      lastSeenStatus: "queued",
      lastState: { status: "queued", conclusion: null },
      active: true,
      error: undefined,
    };
    const { deps } = createDeps(
      [
        {
          status: "in_progress",
          conclusion: null,
          title: "CI: Fix tests",
          url: runTarget.url,
        },
        {
          status: "in_progress",
          conclusion: null,
          title: "CI",
          prNumber: "51",
          url: prRunTarget.url,
        },
      ],
      [{ targets: [prRunTarget], sourceState: "ready" }],
    );
    const controller = createWatchController(deps, [oldWatch]);

    await controller.pollNow();

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/789",
        source: prTarget,
        sourceState: "ready",
        status: "in_progress",
      },
    ]);
  });

  it.each(["merged", "closed"] as const)(
    "keeps polling workflow runs while marking the source PR as %s",
    async (sourceState) => {
      const sourceWatch: WatchRecord = {
        id: "getsentry/sentry/run/789",
        target: prRunTarget,
        source: prTarget,
        label: "CI",
        status: "queued",
        lastSeenStatus: "queued",
        lastState: { status: "queued", conclusion: null },
        active: true,
        error: undefined,
      };
      const { deps, fetches } = createDeps(
        [
          {
            status: "in_progress",
            conclusion: null,
            title: "CI",
            prNumber: "51",
            url: prRunTarget.url,
          },
        ],
        [{ targets: [], sourceState }],
      );
      const controller = createWatchController(deps, [sourceWatch]);

      await controller.pollNow();

      expect(fetches).toEqual([prRunTarget]);
      expect(controller.getWatches()).toMatchObject([
        {
          id: "getsentry/sentry/run/789",
          source: prTarget,
          sourceState,
          status: "in_progress",
          active: true,
        },
      ]);
    },
  );

  it("keeps closed live PR watches even when auto-clearing merged PR watches is enabled", async () => {
    const sourceWatch: WatchRecord = {
      id: "getsentry/sentry/run/789",
      target: prRunTarget,
      source: prTarget,
      label: "CI",
      status: "queued",
      lastSeenStatus: "queued",
      lastState: { status: "queued", conclusion: null },
      active: true,
      error: undefined,
    };
    const { deps, fetches } = createDeps(
      [
        {
          status: "in_progress",
          conclusion: null,
          title: "CI",
          prNumber: "51",
          url: prRunTarget.url,
        },
      ],
      [{ targets: [], sourceState: "closed" }],
    );
    const controller = createWatchController(deps, [sourceWatch], {
      autoClearMergedPrWatches: true,
    });

    await controller.pollNow();

    expect(fetches).toEqual([prRunTarget]);
    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/789",
        source: prTarget,
        sourceState: "closed",
        status: "in_progress",
        active: true,
      },
    ]);
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

  it("notifies only when a watched status changes", async () => {
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

    expect(notifications).toEqual([
      "CI: tests: getsentry/sentry\nIn progress - This check has started...\nPreviously queued",
    ]);
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
          "Completed 1m ago · 7m\n" +
          "Previously in progress",
        largeBody:
          "getsentry/sentry\n" +
          "Successful - This check was successful.\n" +
          "Completed 1m ago · 7m\n" +
          "Previously in progress",
        persistent: true,
        summary: "getsentry/sentry",
        group: "getsentry/sentry",
      },
    ]);
  });

  it("emits one pull-request notification for PR-sourced child status changes", async () => {
    const linuxJobTarget: JobWatchTarget = {
      kind: "job",
      owner: "getsentry",
      repo: "sentry",
      runId: "789",
      jobId: "456",
      prNumber: "51",
      url: "https://github.com/getsentry/sentry/actions/runs/789/job/456",
    };
    const windowsJobTarget: JobWatchTarget = {
      kind: "job",
      owner: "getsentry",
      repo: "sentry",
      runId: "789",
      jobId: "789",
      prNumber: "51",
      url: "https://github.com/getsentry/sentry/actions/runs/789/job/789",
    };
    const { deps, notificationRecords } = createDeps(
      [
        {
          status: "completed",
          conclusion: "success",
          title: "CI: Linux",
          metadata: { workflowName: "CI", jobName: "Linux" },
          prNumber: "51",
          url: linuxJobTarget.url,
        },
        {
          status: "completed",
          conclusion: "failure",
          title: "CI: Windows",
          metadata: { workflowName: "CI", jobName: "Windows" },
          prNumber: "51",
          url: windowsJobTarget.url,
        },
      ],
      [
        {
          targets: [linuxJobTarget, windowsJobTarget],
          targetMetadata: {
            [getWatchId(linuxJobTarget)]: {
              prTitle: "Fix flaky CI",
              workflowName: "CI",
              jobName: "Linux",
            },
            [getWatchId(windowsJobTarget)]: {
              prTitle: "Fix flaky CI",
              workflowName: "CI",
              jobName: "Windows",
            },
          },
          sourceState: "ready",
        },
      ],
    );
    const controller = createWatchController(deps, [
      {
        id: "getsentry/sentry/job/456",
        target: linuxJobTarget,
        source: prTarget,
        sourceState: "ready",
        label: "CI: Linux",
        metadata: {
          prTitle: "Fix flaky CI",
          workflowName: "CI",
          jobName: "Linux",
        },
        status: "in_progress",
        lastSeenStatus: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
        active: true,
        error: undefined,
      },
      {
        id: "getsentry/sentry/job/789",
        target: windowsJobTarget,
        source: prTarget,
        sourceState: "ready",
        label: "CI: Windows",
        metadata: {
          prTitle: "Fix flaky CI",
          workflowName: "CI",
          jobName: "Windows",
        },
        status: "in_progress",
        lastSeenStatus: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
        active: true,
        error: undefined,
      },
    ]);

    await controller.pollNow();

    expect(notificationRecords).toEqual([
      expect.objectContaining({
        watchId: "getsentry/sentry/pull/51",
        title: "#51: Fix flaky CI",
        url: "https://github.com/getsentry/sentry/pull/51",
        body: "getsentry/sentry #51\nFailed - Ready · 1 workflow · 2 checks",
        summary: "getsentry/sentry #51",
        group: "getsentry/sentry #51",
        persistent: true,
      }),
    ]);
  });

  it("does not notify workflow-owned job changes separately from the workflow", async () => {
    const linuxJobTarget: JobWatchTarget = {
      kind: "job",
      owner: "getsentry",
      repo: "sentry",
      runId: "123",
      jobId: "456",
      url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
    };
    const { deps, notificationRecords } = createDeps(
      [
        {
          status: "in_progress",
          conclusion: null,
          title: "CI: Fix tests",
          metadata: { workflowName: "CI", runTitle: "Fix tests" },
          url: runTarget.url,
        },
        {
          status: "completed",
          conclusion: "success",
          title: "CI: Linux",
          metadata: { workflowName: "CI", jobName: "Linux" },
          url: linuxJobTarget.url,
        },
      ],
      [],
      [{ targets: [linuxJobTarget] }],
    );
    const controller = createWatchController(deps, [
      {
        id: "getsentry/sentry/run/123",
        target: runTarget,
        label: "CI: Fix tests",
        metadata: { workflowName: "CI", runTitle: "Fix tests" },
        status: "in_progress",
        lastSeenStatus: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
        active: true,
        error: undefined,
      },
      {
        id: "getsentry/sentry/job/456",
        target: linuxJobTarget,
        sourceRun: runTarget,
        label: "CI: Linux",
        metadata: { workflowName: "CI", jobName: "Linux" },
        status: "in_progress",
        lastSeenStatus: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
        active: true,
        error: undefined,
      },
    ]);

    await controller.pollNow();

    expect(notificationRecords).toEqual([]);
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

  it("removing a watch stops future polls", async () => {
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
    controller.remove("getsentry/sentry/run/123");
    await controller.pollNow();

    expect(fetches).toHaveLength(1);
    expect(controller.getWatches()).toEqual([]);
  });

  it("removing a PR-sourced watch removes the whole live PR watch", async () => {
    const secondPrRunTarget: RunWatchTarget = {
      ...prRunTarget,
      runId: "790",
      url: "https://github.com/getsentry/sentry/actions/runs/790",
    };
    const controller = createWatchController(createDeps([]).deps, [
      {
        id: "getsentry/sentry/run/789",
        target: prRunTarget,
        source: prTarget,
        label: "CI",
        status: "completed:success",
        lastSeenStatus: "completed:success",
        lastState: { status: "completed", conclusion: "success" },
        active: false,
        error: undefined,
      },
      {
        id: "getsentry/sentry/run/790",
        target: secondPrRunTarget,
        source: prTarget,
        label: "E2E",
        status: "completed:success",
        lastSeenStatus: "completed:success",
        lastState: { status: "completed", conclusion: "success" },
        active: false,
        error: undefined,
      },
    ]);

    controller.remove("getsentry/sentry/run/789");

    expect(controller.getWatches()).toEqual([]);
  });

  it("hides one PR workflow while keeping the remaining workflows attached to the PR source", async () => {
    const lintRunTarget: RunWatchTarget = {
      ...prRunTarget,
      runId: "790",
      url: "https://github.com/getsentry/sentry/actions/runs/790",
    };
    const nextLicenseRunTarget: RunWatchTarget = {
      ...prRunTarget,
      runId: "791",
      url: "https://github.com/getsentry/sentry/actions/runs/791",
    };
    const nextLintRunTarget: RunWatchTarget = {
      ...prRunTarget,
      runId: "792",
      url: "https://github.com/getsentry/sentry/actions/runs/792",
    };
    const { deps } = createDeps(
      [
        {
          status: "completed",
          conclusion: "success",
          title: "Lint: eslint",
          metadata: { workflowName: "Lint" },
          prNumber: "51",
          url: nextLintRunTarget.url,
        },
      ],
      [
        {
          targets: [nextLicenseRunTarget, nextLintRunTarget],
          targetMetadata: {
            [getWatchId(nextLicenseRunTarget)]: { workflowName: "License" },
            [getWatchId(nextLintRunTarget)]: { workflowName: "Lint" },
          },
          sourceState: "ready",
        },
        {
          targets: [],
          sourceState: "merged",
        },
      ],
    );
    const controller = createWatchController(deps, [
      {
        id: "getsentry/sentry/run/789",
        target: prRunTarget,
        source: prTarget,
        sourceState: "ready",
        label: "License: check",
        metadata: { workflowName: "License" },
        status: "completed:success",
        lastSeenStatus: "completed:success",
        lastState: { status: "completed", conclusion: "success" },
        active: false,
        error: undefined,
      },
      {
        id: "getsentry/sentry/run/790",
        target: lintRunTarget,
        source: prTarget,
        sourceState: "ready",
        label: "Lint: eslint",
        metadata: { workflowName: "Lint" },
        status: "completed:success",
        lastSeenStatus: "completed:success",
        lastState: { status: "completed", conclusion: "success" },
        active: false,
        error: undefined,
      },
    ]);

    controller.ignorePrWorkflow("getsentry/sentry/run/789");
    await controller.pollNow();

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/792",
        source: prTarget,
        sourceState: "ready",
        metadata: { workflowName: "Lint" },
        ignoredWorkflowNames: ["License"],
      },
    ]);

    controller.setOptions({ autoClearMergedPrWatches: true });
    await controller.pollNow();

    expect(controller.getWatches()).toEqual([]);
  });

  it("hides one direct workflow job while keeping the remaining jobs attached to the workflow", async () => {
    const linuxJobTarget: JobWatchTarget = {
      kind: "job",
      owner: "getsentry",
      repo: "sentry",
      runId: "123",
      jobId: "456",
      url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
    };
    const windowsJobTarget: JobWatchTarget = {
      kind: "job",
      owner: "getsentry",
      repo: "sentry",
      runId: "123",
      jobId: "789",
      url: "https://github.com/getsentry/sentry/actions/runs/123/job/789",
    };
    const { deps } = createDeps(
      [
        {
          status: "in_progress",
          conclusion: null,
          title: "CI: Fix tests",
          url: runTarget.url,
        },
        {
          status: "in_progress",
          conclusion: null,
          title: "CI: Linux",
          url: linuxJobTarget.url,
        },
        {
          status: "completed",
          conclusion: "success",
          title: "CI: Windows",
          url: windowsJobTarget.url,
        },
      ],
      [],
      [
        {
          targets: [linuxJobTarget, windowsJobTarget],
          targetMetadata: {
            [getWatchId(linuxJobTarget)]: { jobName: "Linux" },
            [getWatchId(windowsJobTarget)]: { jobName: "Windows" },
          },
        },
      ],
    );
    const controller = createWatchController(deps, [
      {
        id: "getsentry/sentry/run/123",
        target: runTarget,
        label: "CI: Fix tests",
        status: "in_progress",
        lastSeenStatus: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
        active: true,
        error: undefined,
      },
      {
        id: "getsentry/sentry/job/456",
        target: linuxJobTarget,
        sourceRun: runTarget,
        label: "CI: Linux",
        metadata: { jobName: "Linux" },
        status: "completed:success",
        lastSeenStatus: "completed:success",
        lastState: { status: "completed", conclusion: "success" },
        active: false,
        error: undefined,
      },
    ]);

    controller.remove("getsentry/sentry/job/456");
    await controller.pollNow();

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/123",
        ignoredTargetIds: ["getsentry/sentry/job/456"],
      },
      {
        id: "getsentry/sentry/job/789",
        sourceRun: runTarget,
        metadata: { jobName: "Windows" },
      },
    ]);
  });

  it("keeps a hidden PR workflow hidden when PR refresh metadata is missing", async () => {
    const lintRunTarget: RunWatchTarget = {
      ...prRunTarget,
      runId: "790",
      url: "https://github.com/getsentry/sentry/actions/runs/790",
    };
    const nextLicenseRunTarget: RunWatchTarget = {
      ...prRunTarget,
      runId: "789",
      url: "https://github.com/getsentry/sentry/actions/runs/789",
    };
    const nextLintRunTarget: RunWatchTarget = {
      ...prRunTarget,
      runId: "790",
      url: "https://github.com/getsentry/sentry/actions/runs/790",
    };
    const { deps } = createDeps(
      [
        {
          status: "completed",
          conclusion: "success",
          title: "Lint: eslint",
          prNumber: "51",
          url: nextLintRunTarget.url,
        },
      ],
      [
        {
          targets: [nextLicenseRunTarget, nextLintRunTarget],
          sourceState: "ready",
        },
      ],
    );
    const controller = createWatchController(deps, [
      {
        id: "getsentry/sentry/run/789",
        target: prRunTarget,
        source: prTarget,
        sourceState: "ready",
        label: "License: check",
        metadata: { workflowName: "License" },
        status: "completed:success",
        lastSeenStatus: "completed:success",
        lastState: { status: "completed", conclusion: "success" },
        active: false,
        error: undefined,
      },
      {
        id: "getsentry/sentry/run/790",
        target: lintRunTarget,
        source: prTarget,
        sourceState: "ready",
        label: "Lint: eslint",
        metadata: { workflowName: "Lint" },
        status: "completed:success",
        lastSeenStatus: "completed:success",
        lastState: { status: "completed", conclusion: "success" },
        active: false,
        error: undefined,
      },
    ]);

    controller.ignorePrWorkflow("getsentry/sentry/run/789");
    await controller.pollNow();

    expect(controller.getWatches().map((watch) => watch.id)).toEqual(["getsentry/sentry/run/790"]);
  });

  it("clears all watches", async () => {
    const { deps } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(runTarget);
    controller.clearAll();

    expect(controller.getWatches()).toEqual([]);
  });

  it("clears only inactive watches when clearing finished watches", async () => {
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
    controller.clearFinished();

    expect(controller.getWatches()).toMatchObject([
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

  it("marks all PR-sourced status changes seen from a PR notification id", () => {
    const controller = createWatchController(createDeps([]).deps, [
      {
        id: "getsentry/sentry/job/456",
        target: {
          ...jobTarget,
          prNumber: "51",
        },
        source: prTarget,
        sourceState: "ready",
        label: "CI: Linux",
        status: "completed:success",
        lastSeenStatus: "in_progress",
        lastState: { status: "completed", conclusion: "success" },
        active: false,
        error: undefined,
      },
      {
        id: "getsentry/sentry/job/789",
        target: {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          jobId: "789",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/actions/runs/123/job/789",
        },
        source: prTarget,
        sourceState: "ready",
        label: "CI: Windows",
        status: "completed:failure",
        lastSeenStatus: "in_progress",
        lastState: { status: "completed", conclusion: "failure" },
        active: false,
        error: undefined,
      },
    ]);

    controller.markSeen("getsentry/sentry/pull/51");

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/job/456",
        lastSeenStatus: "completed:success",
      },
      {
        id: "getsentry/sentry/job/789",
        lastSeenStatus: "completed:failure",
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

  it("refreshes missing repository icons for saved watches", async () => {
    const { deps } = createDeps([]);
    const controller = createWatchController(
      {
        ...deps,
        async fetchRepositoryIconUrl(target) {
          expect(target).toBe(runTarget);
          return "https://avatars.githubusercontent.com/u/1396951?v=4";
        },
      },
      [existingWatch()],
    );

    await controller.refreshRepositoryIcons();

    expect(controller.getWatches()).toMatchObject([
      {
        repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
      },
    ]);
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
