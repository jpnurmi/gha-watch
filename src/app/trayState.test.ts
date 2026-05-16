import { describe, expect, it } from "vitest";
import { createTrayState } from "./trayState";
import type { WatchRecord } from "../domain/watches";

function watch(overrides: Partial<WatchRecord>): WatchRecord {
  return {
    id: "getsentry/sentry/run/123",
    target: {
      kind: "run",
      owner: "getsentry",
      repo: "sentry",
      runId: "123",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
    },
    label: "CI",
    status: "pending",
    lastState: undefined,
    active: true,
    error: undefined,
    ...overrides,
  };
}

describe("createTrayState", () => {
  it("uses an idle tray icon when there are no watches", () => {
    expect(createTrayState([])).toEqual({
      status: "idle",
      label: "No watches",
      tooltip: "GHA Watch",
    });
  });

  it("uses an active tray icon when any watch is still running", () => {
    expect(createTrayState([watch({ active: true })])).toEqual({
      status: "active",
      label: "1 active watch",
      tooltip: "GHA Watch: 1 active watch",
    });
  });

  it("uses an error tray icon when any watch failed or errored", () => {
    expect(
      createTrayState([
        watch({
          active: false,
          status: "completed:failure",
          lastState: { status: "completed", conclusion: "failure" },
        }),
      ]),
    ).toEqual({
      status: "error",
      label: "1 watch issue",
      tooltip: "GHA Watch has failed or errored watches",
    });
  });

  it("uses a cancelled tray icon when successful and cancelled watches are the worst statuses", () => {
    expect(
      createTrayState([
        watch({
          active: false,
          status: "completed:success",
          lastState: { status: "completed", conclusion: "success" },
        }),
        watch({
          active: false,
          status: "completed:cancelled",
          lastState: { status: "completed", conclusion: "cancelled" },
        }),
      ]),
    ).toEqual({
      status: "cancelled",
      label: "1 cancelled watch",
      tooltip: "GHA Watch has cancelled watches",
    });
  });

  it("uses a success tray icon when all watched checks completed successfully", () => {
    expect(
      createTrayState([
        watch({
          active: false,
          status: "completed:success",
          lastState: { status: "completed", conclusion: "success" },
        }),
      ]),
    ).toEqual({
      status: "success",
      label: "All watches complete",
      tooltip: "GHA Watch: all watches complete",
    });
  });
});
