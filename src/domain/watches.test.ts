import { describe, expect, it } from "vitest";
import { addWatch, moveWatchWithinRepo, removeWatch, type WatchRecord } from "./watches";

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

  it("removes watches by id", () => {
    const watches = addWatch([], {
      kind: "run",
      owner: "getsentry",
      repo: "sentry",
      runId: "123",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
    });

    expect(removeWatch(watches, "getsentry/sentry/run/123")).toEqual([]);
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
});
