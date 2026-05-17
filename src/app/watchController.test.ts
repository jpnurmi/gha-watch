import { describe, expect, it } from "vitest";
import { createWatchController, type WatchControllerDeps } from "./watchController";
import type { CheckWatchTarget, PrWatchTarget, RunWatchTarget } from "../domain/githubUrl";
import type { FavoriteRepo } from "../domain/favorites";
import type { PrWatchResolution, WatchRecord } from "../domain/watches";
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

function createDeps(states: WatchSnapshot[], prResolutions: TestPrWatchResolution[] = []): {
  deps: WatchControllerDeps;
  notifications: string[];
  notificationRecords: WatchControllerDeps extends { notify(notification: infer Notification): Promise<void> }
    ? Notification[]
    : never;
  saves: WatchRecord[][];
  fetches: CheckWatchTarget[];
  reruns: CheckWatchTarget[];
  prResolves: PrWatchTarget[];
  openPullRequestFetches: FavoriteRepo[];
  activeWorkflowRunFetches: FavoriteRepo[];
} {
  const notifications: string[] = [];
  const notificationRecords: Parameters<WatchControllerDeps["notify"]>[0][] = [];
  const saves: WatchRecord[][] = [];
  const fetches: CheckWatchTarget[] = [];
  const reruns: CheckWatchTarget[] = [];
  const prResolves: PrWatchTarget[] = [];
  const openPullRequestFetches: FavoriteRepo[] = [];
  const activeWorkflowRunFetches: FavoriteRepo[] = [];

  return {
    notifications,
    notificationRecords,
    saves,
    fetches,
    reruns,
    prResolves,
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
