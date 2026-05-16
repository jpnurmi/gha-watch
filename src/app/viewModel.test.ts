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

  it("exposes a repository icon URL for grouped rows", () => {
    const model = createPopupViewModel([
      watch({
        repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
    ]);

    expect(model.groups).toMatchObject([
      {
        repoLabel: "getsentry/sentry",
        repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
      },
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
    expect(model.rows[0].canRerun).toBe(true);
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

  it("marks rows with unseen status changes", () => {
    const model = createPopupViewModel([
      watch({
        status: "completed:success",
        lastSeenStatus: "in_progress",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
      watch({
        id: "getsentry/sentry/run/456",
        status: "queued",
        lastSeenStatus: "queued",
        lastState: { status: "queued", conclusion: null },
      }),
    ]);

    expect(model.rows.map((row) => [row.id, row.unseenStatusChange])).toEqual([
      ["getsentry/sentry/run/123", true],
      ["getsentry/sentry/run/456", false],
    ]);
  });

  it("formats queued, running, and completed timing text", () => {
    const now = new Date("2026-05-16T12:10:00Z");
    const model = createPopupViewModel(
      [
        watch({
          status: "queued",
          lastState: { status: "queued", conclusion: null },
          timing: {
            queuedAt: "2026-05-16T12:06:00Z",
          },
        }),
        watch({
          id: "getsentry/sentry/run/456",
          status: "in_progress",
          lastState: { status: "in_progress", conclusion: null },
          timing: {
            startedAt: "2026-05-16T12:08:00Z",
          },
        }),
        watch({
          id: "getsentry/sentry/run/789",
          status: "completed:success",
          active: false,
          lastState: { status: "completed", conclusion: "success" },
          timing: {
            startedAt: "2026-05-16T12:02:00Z",
            completedAt: "2026-05-16T12:09:00Z",
          },
        }),
      ],
      now,
    );

    expect(model.rows.map((row) => row.timingText)).toEqual([
      "Queued 4m ago",
      "Started 2m ago · 2m elapsed",
      "Completed 1m ago · 7m",
    ]);
  });
});
