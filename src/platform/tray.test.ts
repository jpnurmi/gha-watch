import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { setTrayIndicator } from "./tray";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("setTrayIndicator", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("applies tray updates in request order", async () => {
    const firstInvoke = deferred();
    invoke.mockImplementationOnce(() => firstInvoke.promise).mockResolvedValueOnce(undefined);

    const firstUpdate = setTrayIndicator("active", "GHA Watch: 1 active watch", false);
    const latestUpdate = setTrayIndicator("idle", "GHA Watch", false);
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledTimes(1);

    firstInvoke.resolve();
    await firstUpdate;
    await latestUpdate;

    expect(invoke.mock.calls).toEqual([
      ["set_tray_indicator", {
        status: "active",
        tooltip: "GHA Watch: 1 active watch",
        hasUnseenChanges: false,
      }],
      ["set_tray_indicator", {
        status: "idle",
        tooltip: "GHA Watch",
        hasUnseenChanges: false,
      }],
    ]);
  });
});
