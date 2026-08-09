import { describe, expect, it } from "vitest";
import {
  addWatchSuppressions,
  clearExpiredWatchSuppressions,
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

  it("expires suppressions after five months", () => {
    const suppressions = [
      { id: "expired", clearedAt: "2026-03-01T00:00:00.000Z" },
      { id: "recent", clearedAt: "2026-04-01T00:00:00.000Z" },
    ];

    expect(
      clearExpiredWatchSuppressions(
        suppressions,
        new Date("2026-08-02T00:00:00Z"),
      ).map((suppression) => suppression.id),
    ).toEqual(["recent"]);
  });
});
