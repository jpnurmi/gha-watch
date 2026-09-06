import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadWatches,
  saveWatches,
  loadWatchSuppressions,
  loadWorkflowDiscoveryState,
  saveWatchSuppressions,
  saveWorkflowDiscoveryState,
} from "./store";

describe("watch suppression storage", () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists cleared-watch suppressions", async () => {
    await saveWatchSuppressions([
      {
        id: "getsentry/sentry/run/123",
        clearedAt: "2026-08-09T00:00:00.000Z",
      },
    ]);

    expect(loadWatchSuppressions()).toEqual([
      {
        id: "getsentry/sentry/run/123",
        clearedAt: "2026-08-09T00:00:00.000Z",
      },
    ]);
  });

  it("ignores invalid persisted suppressions", () => {
    values.set(
      "gha-watch:watch-suppressions",
      JSON.stringify([
        { id: "valid", clearedAt: "2026-08-09T00:00:00.000Z" },
        { id: "invalid", clearedAt: "not-a-date" },
      ]),
    );

    expect(loadWatchSuppressions()).toEqual([
      { id: "valid", clearedAt: "2026-08-09T00:00:00.000Z" },
    ]);
  });

  it("persists discovery cursors across restarts", async () => {
    await saveWorkflowDiscoveryState({
      version: 2,
      repositories: {
        "getsentry/sentry": {
          baselineAt: "2026-08-09T00:00:00.000Z",
          lastScannedAt: "2026-08-09T00:00:00.000Z",
          recentRunIds: ["123", "122"],
          subscriptionFingerprint: "{\"pullRequestScope\":null,\"defaultBranchWorkflowNames\":[\"CI\"],\"userWorkflowNames\":[]}",
          updatedAt: "2026-08-09T00:00:00.000Z",
        },
      },
    });

    expect(loadWorkflowDiscoveryState(new Date("2026-08-12T00:00:00Z"))).toEqual({
      version: 2,
      repositories: {
        "getsentry/sentry": {
          baselineAt: "2026-08-09T00:00:00.000Z",
          lastScannedAt: "2026-08-09T00:00:00.000Z",
          recentRunIds: ["123", "122"],
          subscriptionFingerprint: "{\"pullRequestScope\":null,\"workflowTargets\":[{\"kind\":\"default\",\"workflowNames\":[\"CI\"]}]}",
          updatedAt: "2026-08-09T00:00:00.000Z",
        },
      },
    });
  });

  it("migrates legacy records without losing suppressions and keeps failed writes atomic", async () => {
    const watch = {
      id: "getsentry/sentry/run/123",
      target: { kind: "run", owner: "getsentry", repo: "sentry", runId: "123",
        url: "https://github.com/getsentry/sentry/actions/runs/123" },
      label: "Build", status: "queued", active: true,
    };
    values.set("gha-watch:watches", JSON.stringify([null, watch]));
    values.set("gha-watch:watch-suppressions", JSON.stringify([
      { id: "getsentry/sentry/run/456", clearedAt: "2026-09-06T00:00:00Z" },
    ]));
    await saveWatches(loadWatches());
    const persisted = values.get("gha-watch:state")!;
    expect(JSON.parse(persisted).version).toBe(1);
    expect(loadWatches()).toHaveLength(1);
    expect(loadWatchSuppressions()).toHaveLength(1);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: () => { throw new Error("quota exceeded"); },
    });
    await expect(saveWatches([])).rejects.toThrow("quota exceeded");
    expect(values.get("gha-watch:state")).toBe(persisted);
    expect(loadWatches()).toHaveLength(1);
  });

});
