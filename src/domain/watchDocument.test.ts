import { describe, expect, it } from "vitest";
import { encodeStoredWatches, decodeStoredWatches } from "./watchDocument";
import { addWatch } from "./watches";

const [watch] = addWatch([], { kind: "run", owner: "getsentry", repo: "sentry", runId: "123",
  url: "https://github.com/getsentry/sentry/actions/runs/123" });

describe("watch documents", () => {
  it("separates user intent and local acknowledgement from observations", () => {
    const record = { ...watch, triageState: "saved" as const, lastSeenStatus: "queued",
      status: "completed:success", lastState: { status: "completed", conclusion: "success" } };
    const [stored] = encodeStoredWatches([record]);
    expect(stored.intent.triageState).toBe("saved");
    expect(stored.local.lastSeenStatus).toBe("queued");
    expect(stored.observation).not.toHaveProperty("status");
    expect(decodeStoredWatches([stored])).toEqual([record]);
  });

  it("preserves legacy status without a snapshot and isolates corrupt records", () => {
    expect(decodeStoredWatches([null, {}, ...encodeStoredWatches([watch])])).toEqual([watch]);
  });
});
