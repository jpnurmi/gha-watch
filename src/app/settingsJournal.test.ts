import { afterEach, describe, expect, it, vi } from "vitest";
import { createSettingsSync } from "./settingsSync";
import { createSettingsJournal } from "../platform/settingsJournal";
import type { SyncedState } from "../platform/settingsGist";

const baseline: SyncedState = { settings: { watchedRepos: [], repoOrder: [], dismissedPullRequests: [] }, watches: [] };
const edited: SyncedState = { ...baseline, settings: { ...baseline.settings,
  watchedRepos: [{ owner: "getsentry", repo: "sentry", pullRequestScope: "user" }] } };

afterEach(() => vi.unstubAllGlobals());

describe("durable sync retries", () => {
  it("recovers the pending edit and its baseline after restart", async () => {
    let stored: string | null = null;
    vi.stubGlobal("localStorage", { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
    let remoteState = baseline;
    let offline = true;
    const remote = { load: async () => remoteState, save: async (state: SyncedState) => {
      if (offline) throw new Error("offline");
      remoteState = state;
    } };
    const first = createSettingsSync(remote, createSettingsJournal());
    first.acknowledge(baseline);
    await expect(first.push(edited)).rejects.toThrow("offline");
    const restarted = createSettingsSync(remote, createSettingsJournal());
    restarted.acknowledge(edited);
    offline = false;
    expect((await restarted.sync(edited)).settings.watchedRepos).toEqual(edited.settings.watchedRepos);
    expect(createSettingsJournal().load()).toBeUndefined();
  });

  it("does not upload an edit when its journal cannot be persisted", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("storage full"); } });
    const remote = { load: vi.fn(async () => baseline), save: vi.fn(async () => {}) };
    const sync = createSettingsSync(remote, createSettingsJournal());
    await expect(sync.push(edited)).rejects.toThrow("storage full");
    expect(remote.load).not.toHaveBeenCalled();
    expect(remote.save).not.toHaveBeenCalled();
  });
});
