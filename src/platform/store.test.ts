import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadWatchSuppressions, saveWatchSuppressions } from "./store";

describe("watch suppression storage", () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists cleared-watch suppressions", async () => {
    await saveWatchSuppressions([
      {
        id: "getsentry/sentry/run/123",
        clearedAt: "2026-08-09T00:00:00.000Z",
      },
    ]);

    expect(loadWatchSuppressions()).toEqual([
      {
        id: "getsentry/sentry/run/123",
        clearedAt: "2026-08-09T00:00:00.000Z",
      },
    ]);
  });

  it("ignores invalid persisted suppressions", () => {
    values.set(
      "gha-watch:watch-suppressions",
      JSON.stringify([
        { id: "valid", clearedAt: "2026-08-09T00:00:00.000Z" },
        { id: "invalid", clearedAt: "not-a-date" },
      ]),
    );

    expect(loadWatchSuppressions()).toEqual([
      { id: "valid", clearedAt: "2026-08-09T00:00:00.000Z" },
    ]);
  });
});
