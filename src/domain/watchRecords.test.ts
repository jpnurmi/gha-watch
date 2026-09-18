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

  it("ignores malformed notes without losing the watch", () => {
    expect(decodeWatchRecords([{ ...watch, note: { text: "bad" } }])).toEqual([watch]);
  });

  it("restores stack positions without trusting malformed metadata", () => {
    const stacked = { ...watch, metadata: { prStack: { position: 2, size: 5 } } };
    expect(decodeWatchRecords([stacked])).toEqual([stacked]);
    const numbered = { ...watch, metadata: { prStack: { number: 42, position: 2, size: 5 } } };
    expect(decodeWatchRecords([numbered])).toEqual([numbered]);
    for (const number of [0, -1, 1.5, "42"]) {
      expect(decodeWatchRecords([{ ...watch, metadata: { prStack: { number, position: 2, size: 5 } } }]))
        .toEqual([stacked]);
    }
    for (const prStack of [null, {}, { position: 0, size: 5 }, { position: 6, size: 5 }, { position: "2", size: 5 }, { position: 1.5, size: 5 }]) {
      expect(decodeWatchRecords([{ ...watch, metadata: { prStack, runTitle: "Build" } }]))
        .toEqual([{ ...watch, metadata: { runTitle: "Build" } }]);
    }
  });
});
