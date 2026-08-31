import { describe, expect, it } from "vitest";
import { createRefreshCoordinator } from "./refreshCoordinator";

describe("refresh coordinator", () => {
  it("finishes polling before applying a queued synchronized state", async () => {
    let releaseFirstPoll: (() => void) | undefined;
    const firstPoll = new Promise<void>((resolve) => {
      releaseFirstPoll = resolve;
    });
    let finishQueuedRefresh: (() => void) | undefined;
    const queuedRefreshFinished = new Promise<void>((resolve) => {
      finishQueuedRefresh = resolve;
    });
    let state = "inbox";
    let runs = 0;
    const refreshingChanges: boolean[] = [];
    let settled = 0;
    const coordinator = createRefreshCoordinator<string>({
      onRefreshingChanged(refreshing) {
        refreshingChanges.push(refreshing);
      },
      onSettled() {
        settled += 1;

        if (settled === 2) {
          finishQueuedRefresh?.();
        }
      },
      async run() {
        runs += 1;

        if (runs === 1) {
          const stalePollResult = state;
          await firstPoll;
          state = stalePollResult;
          return;
        }

        state = "done";
      },
    });

    const firstRefresh = coordinator.refresh();
    await Promise.resolve();
    void coordinator.refresh("inbox");
    releaseFirstPoll?.();
    await firstRefresh;
    await queuedRefreshFinished;

    expect(runs).toBe(2);
    expect(state).toBe("done");
    expect(refreshingChanges).toEqual([true, false, true, false]);
    expect(settled).toBe(2);
  });
});
