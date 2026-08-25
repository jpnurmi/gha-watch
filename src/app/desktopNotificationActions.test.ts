import { describe, expect, it, vi } from "vitest";
import type { WatchRecord } from "../domain/watches";
import type { DesktopNotificationAction } from "../platform/notifications";
import {
  createDesktopNotificationActionHandler,
  createDesktopNotificationActionQueue,
  type DesktopNotificationActionController,
  type DesktopNotificationActionHandlerDeps,
} from "./desktopNotificationActions";

function watch(overrides: Partial<WatchRecord> = {}): WatchRecord {
  return {
    id: "getsentry/sentry/run/123",
    target: {
      kind: "run",
      owner: "getsentry",
      repo: "sentry",
      runId: "123",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
    },
    label: "CI",
    status: "completed:failure",
    lastSeenStatus: "in_progress",
    lastState: { status: "completed", conclusion: "failure" },
    active: false,
    error: undefined,
    ...overrides,
  };
}

function createDeps(initialWatches: WatchRecord[] = [watch()]): {
  deps: DesktopNotificationActionHandlerDeps;
  controller: DesktopNotificationActionController;
  watches: WatchRecord[];
  clearNotifications: ReturnType<typeof vi.fn>;
  openUrl: ReturnType<typeof vi.fn>;
  queueSync: ReturnType<typeof vi.fn>;
  refreshAfterRerun: ReturnType<typeof vi.fn>;
  refreshStaleWatch: ReturnType<typeof vi.fn>;
  reportError: ReturnType<typeof vi.fn>;
} {
  const watches = [...initialWatches];
  const controller: DesktopNotificationActionController = {
    getWatches: () => watches,
    markSeen: vi.fn((id: string) => {
      const index = watches.findIndex((item) => item.id === id);

      if (index >= 0) {
        watches[index] = { ...watches[index], lastSeenStatus: watches[index].status };
      }
    }),
    rerun: vi.fn(async (id: string) => {
      const index = watches.findIndex((item) => item.id === id);

      if (index >= 0) {
        watches[index] = {
          ...watches[index],
          triageState: "inbox",
          status: "queued",
          lastState: { status: "queued", conclusion: null },
        };
      }
    }),
    setTriageState: vi.fn((ids: string[], state) => {
      const idSet = new Set(ids);

      for (let index = 0; index < watches.length; index += 1) {
        if (idSet.has(watches[index].id)) {
          watches[index] = { ...watches[index], triageState: state };
        }
      }
    }),
    setWatchError: vi.fn((id: string, error: string) => {
      const index = watches.findIndex((item) => item.id === id);

      if (index >= 0) {
        watches[index] = { ...watches[index], error };
      }
    }),
  };
  const clearNotifications = vi.fn(async () => {});
  const openUrl = vi.fn(async () => {});
  const queueSync = vi.fn();
  const refreshAfterRerun = vi.fn();
  const refreshStaleWatch = vi.fn(async () => {});
  const reportError = vi.fn();
  const deps: DesktopNotificationActionHandlerDeps = {
    controller,
    clearNotifications,
    openUrl,
    queueSync,
    refreshAfterRerun,
    refreshStaleWatch,
    reportError,
    now: () => 1_000,
  };

  return {
    deps,
    controller,
    watches,
    clearNotifications,
    openUrl,
    queueSync,
    refreshAfterRerun,
    refreshStaleWatch,
    reportError,
  };
}

function action(
  actionId: DesktopNotificationAction["action"],
): DesktopNotificationAction {
  return {
    watchId: "getsentry/sentry/run/123",
    action: actionId,
    url: "https://github.com/getsentry/sentry/actions/runs/123",
  };
}

describe("desktop notification actions", () => {
  it("opens the current watch URL from the Open action and acknowledges its unseen status", async () => {
    const { deps, controller, clearNotifications, openUrl } = createDeps();
    const handle = createDesktopNotificationActionHandler(deps);

    await handle(action("open"));

    expect(controller.markSeen).toHaveBeenCalledWith("getsentry/sentry/run/123");
    expect(openUrl).toHaveBeenCalledWith("https://github.com/getsentry/sentry/actions/runs/123");
    expect(clearNotifications).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["save", "saved"],
    ["done", "done"],
  ] as const)("routes %s through triage and queues sync", async (actionId, triageState) => {
    const { deps, controller, queueSync, clearNotifications } = createDeps();
    const handle = createDesktopNotificationActionHandler(deps);

    await handle(action(actionId));

    expect(controller.setTriageState).toHaveBeenCalledWith(
      ["getsentry/sentry/run/123"],
      triageState,
    );
    expect(controller.markSeen).toHaveBeenCalledTimes(1);
    expect(queueSync).toHaveBeenCalledTimes(1);
    expect(clearNotifications).toHaveBeenCalledTimes(1);
  });

  it("treats a repeated triage action as one idempotent delivery", async () => {
    const { deps, controller, queueSync } = createDeps();
    const handle = createDesktopNotificationActionHandler(deps);

    await handle(action("save"));
    await handle(action("save"));

    expect(controller.setTriageState).toHaveBeenCalledTimes(1);
    expect(queueSync).toHaveBeenCalledTimes(1);
  });

  it("opens once for duplicate deliveries inside the suppression window", async () => {
    const { deps, openUrl, watches } = createDeps();
    let now = 1_000;
    deps.now = () => now;
    const handle = createDesktopNotificationActionHandler(deps);

    await handle(action("open"));
    now += 29_999;
    await handle(action("open"));

    expect(watches).toHaveLength(1);
    expect(watches[0].target.url).toBe("https://github.com/getsentry/sentry/actions/runs/123");
    expect(openUrl).toHaveBeenCalledTimes(1);
  });

  it("allows a failed action delivery to be retried", async () => {
    const { deps, openUrl } = createDeps();
    openUrl.mockRejectedValueOnce(new Error("open failed"));
    const handle = createDesktopNotificationActionHandler(deps);

    await expect(handle(action("open"))).rejects.toThrow("open failed");
    await handle(action("open"));

    expect(openUrl).toHaveBeenCalledTimes(2);
  });

  it("allows a failed rerun delivery to be retried", async () => {
    const { deps, controller, reportError } = createDeps();
    vi.mocked(controller.rerun).mockRejectedValueOnce(new Error("rerun failed"));
    reportError.mockImplementationOnce(() => {
      throw new Error("report failed");
    });
    const handle = createDesktopNotificationActionHandler(deps);

    await expect(handle(action("rerun-failed"))).rejects.toThrow("report failed");
    await handle(action("rerun-failed"));

    expect(controller.rerun).toHaveBeenCalledTimes(2);
  });

  it("allows a later notification for the same watch and action", async () => {
    const { deps, openUrl } = createDeps();
    let now = 1_000;
    deps.now = () => now;
    const handle = createDesktopNotificationActionHandler(deps);

    await handle(action("open"));
    now += 30_000;
    await handle(action("open"));

    expect(openUrl).toHaveBeenCalledTimes(2);
  });

  it("re-runs failed jobs through the controller and syncs a saved watch removal", async () => {
    const { deps, controller, queueSync, refreshAfterRerun } = createDeps([
      watch({ triageState: "saved" }),
    ]);
    const handle = createDesktopNotificationActionHandler(deps);

    await handle(action("rerun-failed"));
    await handle(action("rerun-failed"));

    expect(controller.rerun).toHaveBeenCalledTimes(1);
    expect(controller.rerun).toHaveBeenCalledWith("getsentry/sentry/run/123", "failed");
    expect(queueSync).toHaveBeenCalledTimes(1);
    expect(refreshAfterRerun).toHaveBeenCalledWith("getsentry/sentry/run/123");
  });

  it("re-runs all jobs through the controller", async () => {
    const { deps, controller, refreshAfterRerun } = createDeps();
    const handle = createDesktopNotificationActionHandler(deps);

    await handle(action("rerun-all"));

    expect(controller.rerun).toHaveBeenCalledWith("getsentry/sentry/run/123", "all");
    expect(refreshAfterRerun).toHaveBeenCalledWith("getsentry/sentry/run/123");
  });

  it("reports and refreshes a rerun action that is no longer applicable", async () => {
    const { deps, controller, refreshStaleWatch, reportError } = createDeps([
      watch({
        status: "completed:success",
        lastState: { status: "completed", conclusion: "success" },
      }),
    ]);
    const handle = createDesktopNotificationActionHandler(deps);

    await handle(action("rerun-failed"));

    expect(controller.rerun).not.toHaveBeenCalled();
    expect(controller.setWatchError).toHaveBeenCalledWith(
      "getsentry/sentry/run/123",
      "Re-run failed is no longer available for this watch.",
    );
    expect(refreshStaleWatch).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      "Re-run failed is no longer available for this watch.",
    );
  });

  it("does not restore a removed watch and only opens a verified stale Open URL", async () => {
    const { deps, controller, openUrl, queueSync } = createDeps([]);
    const handle = createDesktopNotificationActionHandler(deps);

    await handle(action("save"));
    await handle(action("open"));

    expect(controller.setTriageState).not.toHaveBeenCalled();
    expect(queueSync).not.toHaveBeenCalled();
    expect(openUrl).toHaveBeenCalledWith("https://github.com/getsentry/sentry/actions/runs/123");
  });

  it("processes an action received during startup exactly once", async () => {
    const processed: DesktopNotificationAction[] = [];
    const errors: unknown[] = [];
    const queue = createDesktopNotificationActionQueue((error) => errors.push(error));
    const startupAction = action("done");

    queue.receive(startupAction);
    await queue.start(async (received) => {
      processed.push(received);
    });
    await queue.whenIdle();

    expect(processed).toEqual([startupAction]);
    expect(errors).toEqual([]);
  });
});
