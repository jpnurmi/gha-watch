import { describe, expect, it, vi } from "vitest";
import { createApplicationSession } from "./applicationSession";
import type { SyncedState } from "../platform/settingsGist";

const state: SyncedState = { settings: { watchedRepos: [], repoOrder: [], dismissedPullRequests: [] }, watches: [] };

function setup(sync: () => Promise<SyncedState>) {
  const deps = {
    sync: { sync, push: vi.fn(async () => {}), acknowledge: vi.fn() },
    enabled: true, getState: () => state, applySettings: vi.fn(async () => {}),
    applyWatches: vi.fn(), onSynced: vi.fn(), reportError: vi.fn(), poll: vi.fn(async () => {}),
    onRefreshingChanged: vi.fn(), onSettled: vi.fn(),
  };
  return { deps, session: createApplicationSession(deps) };
}

describe("application session", () => {
  it("accepts sync before polling", async () => {
    const { deps, session } = setup(async () => state);
    await session.refresh();
    expect(deps.applyWatches).toHaveBeenCalledWith(state);
    expect(deps.sync.acknowledge).toHaveBeenCalledWith(state);
    expect(deps.poll).toHaveBeenCalledOnce();
    expect(deps.applyWatches.mock.invocationCallOrder[0]).toBeLessThan(deps.poll.mock.invocationCallOrder[0]);
  });

  it("does not overwrite a user edit with a delayed remote response", async () => {
    let release!: (state: SyncedState) => void;
    const pending = new Promise<SyncedState>((resolve) => { release = resolve; });
    const { deps, session } = setup(() => pending);
    const refresh = session.refresh();
    session.changed();
    release(state);
    await refresh;
    expect(deps.sync.push).toHaveBeenCalledWith(state);
    expect(deps.applyWatches).not.toHaveBeenCalled();
    expect(deps.sync.acknowledge).not.toHaveBeenCalled();
    expect(deps.poll).toHaveBeenCalledOnce();
  });

  it("continues polling after a sync failure", async () => {
    const { deps, session } = setup(async () => { throw new Error("offline"); });
    await session.refresh();
    expect(deps.reportError).toHaveBeenCalled();
    expect(deps.poll).toHaveBeenCalledOnce();
  });
});
