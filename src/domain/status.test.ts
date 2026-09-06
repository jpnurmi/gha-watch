import { describe, expect, it } from "vitest";
import { formatWatchState, getStatusTransition, shouldPollWatch } from "./status";

describe("formatWatchState", () => {
  it("keeps active failed-child states distinct from plain in-progress states", () => {
    expect(formatWatchState({ status: "in_progress", conclusion: null, hasFailedChildren: true })).toBe(
      "in_progress:failure",
    );
  });
});

describe("getStatusTransition", () => {
  it("does not notify for the initial baseline state", () => {
    expect(
      getStatusTransition(undefined, {
        status: "queued",
        conclusion: null,
      }),
    ).toEqual({ changed: false, notify: false });
  });

  it("tracks but does not notify when a run starts progressing", () => {
    expect(
      getStatusTransition(
        { status: "queued", conclusion: null },
        { status: "in_progress", conclusion: null },
      ),
    ).toEqual({
      changed: true,
      notify: false,
    });
  });

  it("notifies when a run completes successfully", () => {
    expect(
      getStatusTransition(
        { status: "in_progress", conclusion: null },
        { status: "completed", conclusion: "success" },
      ),
    ).toEqual({
      changed: true,
      notify: true,
    });
  });

  it("notifies when a run completes unsuccessfully", () => {
    expect(
      getStatusTransition(
        { status: "in_progress", conclusion: null },
        { status: "completed", conclusion: "failure" },
      ),
    ).toEqual({
      changed: true,
      notify: true,
    });
  });

  it.each(["cancelled", "skipped"] as const)("does not notify for %s conclusions", (conclusion) => {
    expect(
      getStatusTransition(
        { status: "in_progress", conclusion: null },
        { status: "completed", conclusion },
      ),
    ).toEqual({
      changed: true,
      notify: false,
    });
  });

  it("does not notify for identical statuses", () => {
    expect(
      getStatusTransition(
        { status: "in_progress", conclusion: null },
        { status: "in_progress", conclusion: null },
      ),
    ).toEqual({ changed: false, notify: false });
  });

  it("tracks but does not notify when an active run gains failed children", () => {
    expect(
      getStatusTransition(
        { status: "in_progress", conclusion: null },
        { status: "in_progress", conclusion: null, hasFailedChildren: true },
      ),
    ).toEqual({
      changed: true,
      notify: false,
    });
  });
});

describe("shouldPollWatch", () => {
  it("stops polling successful completions", () => {
    expect(shouldPollWatch({ status: "completed", conclusion: "success" })).toBe(false);
  });

  it.each(["failure", "cancelled", "skipped", null])(
    "keeps completed %s states active",
    (conclusion) => {
      expect(shouldPollWatch({ status: "completed", conclusion })).toBe(true);
    },
  );

  it("keeps non-completed statuses active", () => {
    expect(shouldPollWatch({ status: "in_progress", conclusion: null })).toBe(true);
  });
});
