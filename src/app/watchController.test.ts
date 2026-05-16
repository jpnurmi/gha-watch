import { describe, expect, it } from "vitest";
import { createWatchController, type WatchControllerDeps } from "./watchController";
import type { ParsedWatchTarget } from "../domain/githubUrl";
import type { WatchSnapshot } from "../platform/gh";

const runTarget: ParsedWatchTarget = {
  kind: "run",
  owner: "getsentry",
  repo: "sentry",
  runId: "123",
  url: "https://github.com/getsentry/sentry/actions/runs/123",
};

function createDeps(states: WatchSnapshot[]): {
  deps: WatchControllerDeps;
  notifications: string[];
  fetches: ParsedWatchTarget[];
} {
  const notifications: string[] = [];
  const fetches: ParsedWatchTarget[] = [];

  return {
    notifications,
    fetches,
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
        notifications.push(`${notification.title}: ${notification.body}`);
      },
      async save() {},
    },
  };
}

describe("watchController", () => {
  it("adds a watch and fetches baseline state without notifying", async () => {
    const { deps, notifications } = createDeps([
      {
        status: "queued",
        conclusion: null,
        title: "CI: tests",
        url: runTarget.url,
      },
    ]);
    const controller = createWatchController(deps);

    await controller.add(runTarget);

    expect(controller.getWatches()).toMatchObject([
      {
        id: "getsentry/sentry/run/123",
        status: "queued",
        active: true,
        lastState: { status: "queued", conclusion: null },
      },
    ]);
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

    expect(notifications).toEqual(["CI: tests: queued -> in_progress"]);
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
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      },
    ]);
  });
});
