import { describe, expect, it } from "vitest";
import type { WatchRecord } from "../domain/watches";
import { createWatchNotification } from "./watchNotification";

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
    label: "CI: tests",
    status: "completed:success",
    lastSeenStatus: "in_progress",
    lastState: { status: "completed", conclusion: "success" },
    timing: {
      startedAt: "2026-05-16T12:02:00Z",
      completedAt: "2026-05-16T12:09:00Z",
    },
    active: false,
    error: undefined,
    ...overrides,
  };
}

describe("createWatchNotification", () => {
  it("formats notification content like a watch item", () => {
    expect(
      createWatchNotification(
        watch(),
        { status: "in_progress", conclusion: null },
        new Date("2026-05-16T12:10:00Z"),
      ),
    ).toEqual({
      watchId: "getsentry/sentry/run/123",
      title: "CI: tests",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
      body:
        "getsentry/sentry\n" +
        "Successful - This check was successful.\n" +
        "Completed 1m ago · 7m\n" +
        "Previously in progress",
      largeBody:
        "getsentry/sentry\n" +
        "Successful - This check was successful.\n" +
        "Completed 1m ago · 7m\n" +
        "Previously in progress",
      summary: "getsentry/sentry",
      group: "getsentry/sentry",
      persistent: true,
    });
  });

  it("mentions pull request references next to the repository", () => {
    expect(
      createWatchNotification(
        watch({
          target: {
            kind: "run",
            owner: "getsentry",
            repo: "sentry",
            runId: "123",
            prNumber: "51",
            url: "https://github.com/getsentry/sentry/actions/runs/123",
          },
        }),
        { status: "in_progress", conclusion: null },
      ),
    ).toMatchObject({
      body: expect.stringContaining("getsentry/sentry #51"),
      summary: "getsentry/sentry #51",
      group: "getsentry/sentry #51",
    });
  });

  it("marks non-terminal status changes as transient", () => {
    expect(
      createWatchNotification(
        watch({
          status: "in_progress",
          active: true,
          lastState: { status: "in_progress", conclusion: null },
          timing: {
            startedAt: "2026-05-16T12:02:00Z",
          },
        }),
        { status: "queued", conclusion: null },
      ).persistent,
    ).toBe(false);
  });

  it("uses the exact watched URL for notification clicks", () => {
    expect(
      createWatchNotification(
        watch({
          target: {
            kind: "job",
            owner: "getsentry",
            repo: "sentry",
            runId: "123",
            jobId: "456",
            url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
          },
        }),
        { status: "in_progress", conclusion: null },
      ).url,
    ).toBe("https://github.com/getsentry/sentry/actions/runs/123/job/456");
  });

  it("uses natural transition wording for queued checks", () => {
    expect(createWatchNotification(watch(), { status: "queued", conclusion: null }).body).toContain("Previously queued");
  });

  it("uses skipped wording for skipped check notifications", () => {
    expect(
      createWatchNotification(
        watch({
          status: "completed:skipped",
          lastState: { status: "completed", conclusion: "skipped" },
        }),
        { status: "queued", conclusion: null },
      ),
    ).toMatchObject({
      body: expect.stringContaining("Skipped - This check was skipped."),
      persistent: true,
    });
  });
});
