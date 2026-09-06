import { describe, expect, it } from "vitest";
import { decodeWatchRecords } from "./watchRecords";
import { addWatch } from "./watches";

const [watch] = addWatch([], { kind: "run", owner: "getsentry", repo: "sentry", runId: "123",
  url: "https://github.com/getsentry/sentry/actions/runs/123" });

describe("watch records", () => {
  it("isolates corrupt entries and preserves legacy watches", () => {
    expect(decodeWatchRecords([null, 42, {}, { ...watch, target: null }, watch, watch])).toEqual([watch]);
  });

  it("reconstructs nested values without trusting extra fields", () => {
    const [decoded] = decodeWatchRecords([{ ...watch, unexpected: true,
      metadata: { prTitle: ["bad"], runTitle: "Build", extra: true },
      lastState: { status: [], conclusion: {} }, source: { kind: "pr" },
      sourceState: "invalid", timing: { startedAt: "invalid" }, ignoredTargetIds: [null, "valid"],
    }]);
    expect(decoded).toEqual({ ...watch, metadata: { runTitle: "Build" }, timing: {}, ignoredTargetIds: ["valid"] });
  });

  it("rejects invalid identities and unsafe links", () => {
    expect(decodeWatchRecords([
      { ...watch, id: "different" },
      { ...watch, target: { ...watch.target, runId: "invalid" } },
      { ...watch, target: { ...watch.target, url: "javascript:alert(1)" } },
    ])).toEqual([]);
  });
});
