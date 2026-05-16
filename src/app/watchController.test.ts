import { describe, expect, it } from "vitest";
import { createWatchController, type WatchControllerDeps } from "./watchController";
import type { CheckWatchTarget, PrWatchTarget, RunWatchTarget } from "../domain/githubUrl";
import type { WatchRecord } from "../domain/watches";
import type { WatchSnapshot } from "../platform/gh";

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

function createDeps(states: WatchSnapshot[], prResolutions: CheckWatchTarget[][] = []): {
  deps: WatchControllerDeps;
  notifications: string[];
  notificationRecords: WatchControllerDeps extends { notify(notification: infer Notification): Promise<void> }
    ? Notification[]
    : never;
  fetches: CheckWatchTarget[];
  reruns: CheckWatchTarget[];
  prResolves: PrWatchTarget[];
} {
  const notifications: string[] = [];
  const notificationRecords: Parameters<WatchControllerDeps["notify"]>[0][] = [];
  const fetches: CheckWatchTarget[] = [];
  const reruns: CheckWatchTarget[] = [];
  const prResolves: PrWatchTarget[] = [];

  return {
    notifications,
    notificationRecords,
    fetches,
    reruns,
    prResolves,
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

        return targets;
      },
      async save() {},
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
        label: "CI: tests",
        status: "queued",
        lastSeenStatus: "queued",
      },
    ]);
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
        status: "in_progress",
      },
    ]);
    expect(notifications).toEqual([]);
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
