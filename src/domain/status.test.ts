import { describe, expect, it } from "vitest";
import { getStatusTransition, isTerminalStatus } from "./status";

describe("getStatusTransition", () => {
  it("does not notify for the initial baseline state", () => {
    expect(
      getStatusTransition(undefined, {
        status: "queued",
        conclusion: null,
      }),
    ).toEqual({ changed: false, notify: false });
  });

  it("notifies when a run starts progressing", () => {
    expect(
      getStatusTransition(
        { status: "queued", conclusion: null },
        { status: "in_progress", conclusion: null },
      ),
    ).toEqual({
      changed: true,
      notify: true,
      message: "queued -> in_progress",
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
      message: "in_progress -> completed:success",
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
});

describe("isTerminalStatus", () => {
  it("treats completed statuses as terminal", () => {
    expect(isTerminalStatus({ status: "completed", conclusion: "failure" })).toBe(true);
  });

  it("keeps non-completed statuses active", () => {
    expect(isTerminalStatus({ status: "in_progress", conclusion: null })).toBe(false);
  });
});
