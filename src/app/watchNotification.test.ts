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
    expect(createWatchNotification(watch(), new Date("2026-05-16T12:10:00Z"))).toEqual({
      watchId: "getsentry/sentry/run/123",
      title: "CI: tests",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
      body:
        "getsentry/sentry\n" +
        "Successful - This check was successful.\n" +
        "Completed 1m ago · 7m",
      largeBody:
        "getsentry/sentry\n" +
        "Successful - This check was successful.\n" +
        "Completed 1m ago · 7m",
      summary: "getsentry/sentry",
      group: "getsentry/sentry",
      persistent: false,
      timeoutMs: 15_000,
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
      ),
    ).toMatchObject({
      body: expect.stringContaining("getsentry/sentry #51"),
      summary: "getsentry/sentry #51",
      group: "getsentry/sentry #51",
    });
  });

  it("marks non-failure status changes as transient", () => {
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
      ).persistent,
    ).toBe(false);
  });

  it("keeps failures persistent until they are confirmed", () => {
    const notification = createWatchNotification(
      watch({
        status: "completed:failure",
        lastState: { status: "completed", conclusion: "failure" },
      }),
    );

    expect(notification).toMatchObject({
      persistent: true,
    });
    expect(notification).not.toHaveProperty("timeoutMs");
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
      ).url,
    ).toBe("https://github.com/getsentry/sentry/actions/runs/123/job/456");
  });

  it("uses skipped wording for skipped check notifications", () => {
    expect(
      createWatchNotification(
        watch({
          status: "completed:skipped",
          lastState: { status: "completed", conclusion: "skipped" },
        }),
      ),
    ).toMatchObject({
      body: expect.stringContaining("Skipped - This check was skipped."),
      persistent: false,
      timeoutMs: 15_000,
    });
  });
});
