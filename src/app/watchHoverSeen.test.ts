import { describe, expect, it } from "vitest";
import type { WatchRecord } from "../domain/watches";
import { getHoveredUnseenWatchId } from "./watchHoverSeen";

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

describe("getHoveredUnseenWatchId", () => {
  it("returns the hovered watch id only when it has an unseen status change", () => {
    expect(getHoveredUnseenWatchId([watch], "getsentry/sentry/run/123")).toBe("getsentry/sentry/run/123");
    expect(
      getHoveredUnseenWatchId([{ ...watch, lastSeenStatus: "completed:success" }], "getsentry/sentry/run/123"),
    ).toBeUndefined();
    expect(getHoveredUnseenWatchId([watch], "getsentry/sentry/run/missing")).toBeUndefined();
    expect(getHoveredUnseenWatchId([watch], undefined)).toBeUndefined();
  });
});
