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
    expect(model.headerTone).toBe("warning");
  });

  it("uses a muted header tone when every check passed", () => {
    const model = createPopupViewModel([
      watch({
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
    ]);

    expect(model.title).toBe("All checks have passed");
    expect(model.headerTone).toBe("success");
  });

  it("groups rows by repository in first-seen order", () => {
    const model = createPopupViewModel([
      watch({
        label: "CI",
        status: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
      }),
      watch({
        id: "jpnurmi/sentry-qml/run/456",
        target: {
          kind: "run",
          owner: "jpnurmi",
          repo: "sentry-qml",
          runId: "456",
          url: "https://github.com/jpnurmi/sentry-qml/actions/runs/456",
        },
        label: "E2E",
        status: "queued",
        lastState: { status: "queued", conclusion: null },
      }),
      watch({
        id: "getsentry/sentry/run/789",
        target: {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "789",
          url: "https://github.com/getsentry/sentry/actions/runs/789",
        },
        label: "Lint",
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
    ]);

    expect(model.groups.map((group) => [group.repoLabel, group.rows.map((row) => row.label)])).toEqual([
      ["getsentry/sentry", ["CI", "Lint"]],
      ["jpnurmi/sentry-qml", ["E2E"]],
    ]);
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

  it("presents cancelled checks distinctly from failed checks", () => {
    const model = createPopupViewModel([
      watch({
        status: "completed:cancelled",
        active: false,
        lastState: { status: "completed", conclusion: "cancelled" },
      }),
    ]);

    expect(model.title).toBe("Some checks were cancelled");
    expect(model.subtitle).toBe("1 cancelled check");
    expect(model.rows.map((row) => [row.statusLabel, row.description, row.tone])).toEqual([
      ["Cancelled", "This check was cancelled.", "cancelled"],
    ]);
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
