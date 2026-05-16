import { describe, expect, it } from "vitest";
import { createPopupViewModel } from "./viewModel";
import type { WatchRecord } from "../domain/watches";

function watch(overrides: Partial<WatchRecord>): WatchRecord {
  return {
    id: "getsentry/sentry/run/123",
    target: {
      kind: "run",
      owner: "getsentry",
      repo: "sentry",
      runId: "123",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
    },
    label: "CI / macOS (push)",
    status: "pending",
    lastState: undefined,
    active: true,
    error: undefined,
    ...overrides,
  };
}

describe("createPopupViewModel", () => {
  it("summarizes incomplete checks like GitHub's checks popup", () => {
    const model = createPopupViewModel([
      watch({ status: "in_progress", lastState: { status: "in_progress", conclusion: null } }),
      watch({ status: "queued", lastState: { status: "queued", conclusion: null } }),
      watch({
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
    ]);

    expect(model.title).toBe("Some checks haven't completed yet");
    expect(model.subtitle).toBe("1 in progress, 1 successful, and 1 queued checks");
  });

  it("prioritizes failed checks in the header", () => {
    const model = createPopupViewModel([
      watch({
        status: "completed:failure",
        active: false,
        lastState: { status: "completed", conclusion: "failure" },
      }),
    ]);

    expect(model.title).toBe("Some checks were not successful");
    expect(model.subtitle).toBe("1 failed check");
  });

  it("creates row text for queued and in-progress watches", () => {
    const model = createPopupViewModel([
      watch({ status: "queued", lastState: { status: "queued", conclusion: null } }),
      watch({ status: "in_progress", lastState: { status: "in_progress", conclusion: null } }),
    ]);

    expect(model.rows.map((row) => [row.statusLabel, row.description, row.tone])).toEqual([
      ["Queued", "Waiting to run this check...", "queued"],
      ["In progress", "This check has started...", "in-progress"],
    ]);
  });
});
