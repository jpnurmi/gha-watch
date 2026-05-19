import { describe, expect, it } from "vitest";
import type { WatchRecord } from "../domain/watches";
import { getClickedUnseenWatchId, getClickedUnseenWatchIds } from "./watchSeenAction";

const watch: WatchRecord = {
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
  active: false,
  error: undefined,
};

describe("getClickedUnseenWatchId", () => {
  it("returns the clicked watch id only when it has an unseen status change", () => {
    expect(getClickedUnseenWatchId([watch], "getsentry/sentry/run/123")).toBe("getsentry/sentry/run/123");
    expect(
      getClickedUnseenWatchId([{ ...watch, lastSeenStatus: "completed:success" }], "getsentry/sentry/run/123"),
    ).toBeUndefined();
    expect(getClickedUnseenWatchId([watch], "getsentry/sentry/run/missing")).toBeUndefined();
    expect(getClickedUnseenWatchId([watch], undefined)).toBeUndefined();
  });

  it("returns clicked row ids that have unseen status changes", () => {
    expect(
      getClickedUnseenWatchIds(
        [
          watch,
          {
            ...watch,
            id: "getsentry/sentry/run/456",
            lastSeenStatus: "completed:success",
          },
          {
            ...watch,
            id: "getsentry/sentry/job/789",
            lastSeenStatus: "queued",
            status: "completed:failure",
          },
        ],
        undefined,
        ["getsentry/sentry/run/123", "getsentry/sentry/run/456", "getsentry/sentry/job/789"],
      ),
    ).toEqual(["getsentry/sentry/run/123", "getsentry/sentry/job/789"]);
  });
});
