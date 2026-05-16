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
