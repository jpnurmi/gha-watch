import { describe, expect, it } from "vitest";
import { addWatch, removeWatch } from "./watches";

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
});
