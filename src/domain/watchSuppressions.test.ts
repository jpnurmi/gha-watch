import { describe, expect, it } from "vitest";
import {
  addWatchSuppressions,
  isWatchSuppressed,
  normalizeWatchSuppressions,
  removeWatchSuppression,
} from "./watchSuppressions";

describe("watch suppressions", () => {
  it("normalizes persisted suppressions", () => {
    expect(
      normalizeWatchSuppressions([
        { id: "run-1", clearedAt: "2026-01-01T00:00:00.000Z" },
        { id: "run-1", clearedAt: "2026-02-01T00:00:00.000Z" },
        { id: "run-2", clearedAt: "invalid" },
        null,
      ]),
    ).toEqual([{ id: "run-1", clearedAt: "2026-02-01T00:00:00.000Z" }]);
  });

  it("adds and manually overrides suppressions", () => {
    const suppressions = addWatchSuppressions(
      [],
      ["run-1"],
      new Date("2026-03-01T00:00:00Z"),
    );

    expect(isWatchSuppressed(suppressions, "run-1")).toBe(true);
    expect(removeWatchSuppression(suppressions, "run-1")).toEqual([]);
  });

  it("keeps the latest suppression across repository casing and input order", () => {
    expect(normalizeWatchSuppressions([
      { id: "Owner/Repo/run/1", clearedAt: "2026-07-15T00:00:00.000Z" },
      { id: "owner/repo/run/1", clearedAt: "2026-07-01T00:00:00.000Z" },
    ])).toEqual([{ id: "owner/repo/run/1", clearedAt: "2026-07-15T00:00:00.000Z" }]);
  });
});
