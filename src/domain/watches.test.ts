import { describe, expect, it } from "vitest";
import {
  addWatch,
  clearDoneWatches,
  clearExpiredDoneWatches,
  createCheckKey,
  getWatchTriageState,
  moveWatchGroupWithinRepo,
  moveWatchWithinRepo,
  normalizeWatchDoneAt,
  normalizeIgnoredCheckKeys,
  normalizeWatchCheckPreferences,
  normalizeWatchSeenStatus,
  setWatchesTriageState,
  type WatchRecord,
} from "./watches";

function watch(overrides: Partial<WatchRecord>): WatchRecord {
  const target = overrides.target ?? {
    kind: "run" as const,
    owner: "getsentry",
    repo: "sentry",
    runId: "123",
    url: "https://github.com/getsentry/sentry/actions/runs/123",
  };

  return {
    id: overrides.id ?? "getsentry/sentry/run/123",
    target,
    label: overrides.label ?? "CI",
    status: "pending",
    lastSeenStatus: "pending",
    lastState: undefined,
    active: true,
    error: undefined,
    ...overrides,
  };
}

function runWatch(owner: string, repo: string, runId: string): WatchRecord {
  return watch({
    id: `${owner}/${repo}/run/${runId}`,
    target: {
      kind: "run",
      owner,
      repo,
      runId,
      url: `https://github.com/${owner}/${repo}/actions/runs/${runId}`,
    },
  });
}

describe("watch operations", () => {
  it("adds a pending watch with a stable id", () => {
    const watches = addWatch([], {
      kind: "run",
      owner: "getsentry",
      repo: "sentry",
      runId: "123",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
    });

    expect(watches).toEqual([
      {
        id: "getsentry/sentry/run/123",
        target: {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          url: "https://github.com/getsentry/sentry/actions/runs/123",
        },
        label: "getsentry/sentry#123",
        status: "pending",
        lastSeenStatus: "pending",
        lastState: undefined,
        active: true,
        error: undefined,
      },
    ]);
  });

  it("does not add duplicate watches", () => {
    const first = addWatch([], {
      kind: "job",
      owner: "getsentry",
      repo: "sentry",
      jobId: "456",
      url: "https://github.com/getsentry/sentry/runs/456",
    });

    expect(addWatch(first, first[0].target)).toBe(first);
  });

  it("restores terminal state from saved status labels", () => {
    expect(
      normalizeWatchSeenStatus(
        watch({
          active: false,
          status: "completed:cancelled",
          lastSeenStatus: undefined,
          lastState: undefined,
        }),
      ),
    ).toMatchObject({
      status: "completed:cancelled",
      lastSeenStatus: "completed:cancelled",
      lastState: {
        status: "completed",
        conclusion: "cancelled",
      },
    });
  });

  it("restores active failed-child state from saved status labels", () => {
    expect(
      normalizeWatchSeenStatus(
        watch({
          status: "in_progress:failure",
          lastSeenStatus: undefined,
          lastState: undefined,
        }),
      ),
    ).toMatchObject({
      status: "in_progress:failure",
      lastSeenStatus: "in_progress:failure",
      lastState: {
        status: "in_progress",
        conclusion: null,
        hasFailedChildren: true,
      },
    });
  });

  it("stores the source PR when adding a resolved PR run watch", () => {
    const watches = addWatch(
      [],
      {
        kind: "run",
        owner: "getsentry",
        repo: "sentry",
        runId: "123",
        prNumber: "51",
        url: "https://github.com/getsentry/sentry/actions/runs/123",
      },
      {
        kind: "pr",
        owner: "getsentry",
        repo: "sentry",
        prNumber: "51",
        url: "https://github.com/getsentry/sentry/pull/51",
      },
    );

    expect(watches[0].source).toEqual({
      kind: "pr",
      owner: "getsentry",
      repo: "sentry",
      prNumber: "51",
      url: "https://github.com/getsentry/sentry/pull/51",
    });
  });

  it("defaults existing watches to the inbox", () => {
    expect(getWatchTriageState(watch({}))).toBe("inbox");
  });

  it("moves selected watches between triage states", () => {
    const watches = [
      watch({ lastSeenStatus: "queued", status: "completed:success" }),
      runWatch("getsentry", "sentry", "456"),
    ];

    const next = setWatchesTriageState(
      watches,
      ["getsentry/sentry/run/123"],
      "done",
      new Date("2026-01-15T12:00:00Z"),
    );

    expect(next[0]).toMatchObject({
      id: "getsentry/sentry/run/123",
      triageState: "done",
      doneAt: "2026-01-15T12:00:00.000Z",
      lastSeenStatus: "completed:success",
    });
    expect(next[1]).toBe(watches[1]);

    const saved = setWatchesTriageState(
      next,
      ["getsentry/sentry/run/123"],
      "saved",
      new Date("2026-01-16T12:00:00Z"),
    );

    expect(saved[0]).not.toHaveProperty("doneAt");
  });

  it("timestamps older Done records when they are loaded", () => {
    expect(
      normalizeWatchDoneAt(
        watch({ triageState: "done" }),
        new Date("2026-02-01T10:00:00Z"),
      ),
    ).toMatchObject({
      triageState: "done",
      doneAt: "2026-02-01T10:00:00.000Z",
    });
  });

  it("clears Done watches manually or after one month", () => {
    const inbox = watch({ id: "inbox" });
    const saved = watch({ id: "saved", triageState: "saved" });
    const recentDone = watch({
      id: "recent-done",
      triageState: "done",
      doneAt: "2026-07-15T00:00:00.000Z",
    });
    const expiredDone = watch({
      id: "expired-done",
      triageState: "done",
      doneAt: "2026-07-01T00:00:00.000Z",
    });
    const watches = [inbox, saved, recentDone, expiredDone];

    expect(
      clearExpiredDoneWatches(watches, new Date("2026-08-02T00:00:00Z")).map(
        (item) => item.id,
      ),
    ).toEqual(["inbox", "saved", "recent-done"]);
    expect(
      clearDoneWatches(watches, ["recent-done"]).map((item) => item.id),
    ).toEqual(["inbox", "saved", "expired-done"]);
  });

  it("keeps at most the 100 newest Done watches", () => {
    const doneWatches = Array.from({ length: 102 }, (_, index) =>
      watch({
        id: `done-${String(index)}`,
        triageState: "done",
        doneAt: new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString(),
      })
    );
    const retained = clearExpiredDoneWatches(
      doneWatches,
      new Date("2026-08-15T00:00:00Z"),
    );

    expect(retained).toHaveLength(100);
    expect(retained.map((item) => item.id)).not.toContain("done-0");
    expect(retained.map((item) => item.id)).not.toContain("done-1");
  });

  it("moves a watch within its repository while preserving other repository slots", () => {
    const watches = [
      runWatch("getsentry", "sentry", "123"),
      runWatch("jpnurmi", "gha-watch", "456"),
      runWatch("getsentry", "sentry", "789"),
    ];

    expect(
      moveWatchWithinRepo(
        watches,
        "getsentry/sentry/run/123",
        "getsentry/sentry/run/789",
        "after",
      ).map((item) => item.id),
    ).toEqual([
      "getsentry/sentry/run/789",
      "jpnurmi/gha-watch/run/456",
      "getsentry/sentry/run/123",
    ]);
  });

  it("does not move a watch across repository groups", () => {
    const watches = [
      runWatch("getsentry", "sentry", "123"),
      runWatch("jpnurmi", "gha-watch", "456"),
    ];

    expect(
      moveWatchWithinRepo(
        watches,
        "getsentry/sentry/run/123",
        "jpnurmi/gha-watch/run/456",
        "before",
      ),
    ).toBe(watches);
  });

  it("moves a group of watches within one repository", () => {
    const watches = [
      runWatch("getsentry", "sentry", "101"),
      runWatch("getsentry", "sentry", "102"),
      runWatch("getsentry", "sentry", "201"),
      runWatch("getsentry", "sentry", "301"),
      runWatch("getsentry", "sentry", "302"),
    ];

    expect(
      moveWatchGroupWithinRepo(
        watches,
        ["getsentry/sentry/run/301", "getsentry/sentry/run/302"],
        ["getsentry/sentry/run/101", "getsentry/sentry/run/102"],
        "before",
      ).map((watch) => watch.id),
    ).toEqual([
      "getsentry/sentry/run/301",
      "getsentry/sentry/run/302",
      "getsentry/sentry/run/101",
      "getsentry/sentry/run/102",
      "getsentry/sentry/run/201",
    ]);
  });

  it("does not move a group across repository groups", () => {
    const watches = [runWatch("getsentry", "sentry", "101"), runWatch("jpnurmi", "gha-watch", "201")];

    expect(
      moveWatchGroupWithinRepo(
        watches,
        ["getsentry/sentry/run/101"],
        ["jpnurmi/gha-watch/run/201"],
        "after",
      ),
    ).toBe(watches);
  });

  it("normalizes versioned check keys and rejects malformed persisted values", () => {
    const key = createCheckKey("GitHub-Actions", " CI  Build ", " Test  Linux ");

    expect(key).toBe("check:v1:github-actions:ci%20build:test%20linux");
    expect(normalizeIgnoredCheckKeys([
      key,
      key,
      "check:v1:github-actions:CI%20Build:test%20linux",
      "check:v2:github-actions:ci:test",
      "check:v1:missing-name:",
      42,
    ])).toEqual([key]);
  });

  it("drops uninterpretable legacy ignore fields during migration", () => {
    const normalized = normalizeWatchCheckPreferences({
      ...watch({}),
      ignoredWorkflowNames: ["CI"],
      ignoredTargetIds: ["123"],
      ignoredCheckKeys: ["check:v1:github-actions:ci:test", "malformed"],
    } as WatchRecord & { ignoredWorkflowNames: string[]; ignoredTargetIds: string[] });

    expect(normalized.ignoredCheckKeys).toEqual(["check:v1:github-actions:ci:test"]);
    expect(normalized).not.toHaveProperty("ignoredWorkflowNames");
    expect(normalized).not.toHaveProperty("ignoredTargetIds");
  });
});
