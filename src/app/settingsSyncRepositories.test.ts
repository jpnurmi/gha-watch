import { describe, expect, it } from "vitest";
import type { WatchedRepo } from "../domain/watchedRepos";
import type { SettingsRemote, SyncedState } from "../platform/settingsGist";
import { createSettingsSync, mergeSyncedStates } from "./settingsSync";

const first: WatchedRepo = { owner: "getsentry", repo: "sentry", pullRequestScope: "user" };
const second: WatchedRepo = { owner: "getsentry", repo: "relay", pullRequestScope: "all" };
const state = (watchedRepos: WatchedRepo[] = []): SyncedState => ({
  settings: { watchedRepos, repoOrder: [], dismissedPullRequests: [] },
  watches: [],
});

describe("repository settings sync", () => {
  it("preserves independent additions from two clients", async () => {
    let stored = state();
    const remote: SettingsRemote = {
      load: async () => stored,
      save: async (next) => { stored = next; },
    };
    const a = createSettingsSync(remote);
    const b = createSettingsSync(remote);
    await a.sync(stored);
    await b.sync(stored);

    await a.push(state([first]));
    await b.push(state([second]));

    expect(stored.settings.watchedRepos).toEqual([first, second]);
  });

  it("merges removals with unrelated additions", () => {
    expect(mergeSyncedStates(state([first]), state([]), state([first, second])).settings.watchedRepos)
      .toEqual([second]);
    expect(mergeSyncedStates(state([first]), state([first, second]), state([])).settings.watchedRepos)
      .toEqual([second]);
  });

  it("merges scope and workflow edits within a repository", () => {
    const edited = { ...first, pullRequestScope: "all" as const };
    const current = { ...first, workflowTargets: [{ kind: "default" as const, workflowNames: ["CI"] }] };

    expect(mergeSyncedStates(state([first]), state([edited]), state([current])).settings.watchedRepos)
      .toEqual([{ ...current, pullRequestScope: "all" }]);
  });

  it("merges independently added targets and workflow names", () => {
    const baseline = { ...first, workflowTargets: [{ kind: "default" as const, workflowNames: ["CI"] }] };
    const local = {
      ...baseline,
      workflowTargets: [
        { kind: "default" as const, workflowNames: ["Build"] },
        { kind: "own" as const, workflowNames: ["CI"] },
      ],
    };
    const remote = {
      ...baseline,
      workflowTargets: [
        { kind: "default" as const, workflowNames: ["CI", "Lint"] },
        { kind: "all" as const, workflowNames: ["Test"] },
      ],
    };

    expect(mergeSyncedStates(state([baseline]), state([local]), state([remote])).settings.watchedRepos)
      .toEqual([{
        ...first,
        workflowTargets: [
          { kind: "default", workflowNames: ["Lint", "Build"] },
          { kind: "all", workflowNames: ["Test"] },
          { kind: "own", workflowNames: ["CI"] },
        ],
      }]);
  });

  it("merges subscriptions when both devices add the same repository", () => {
    const current = { owner: first.owner.toUpperCase(), repo: first.repo.toUpperCase(), workflowTargets: [
      { kind: "default" as const, workflowNames: ["CI"] },
    ] };

    expect(mergeSyncedStates(state(), state([first]), state([current])).settings.watchedRepos)
      .toEqual([{ ...current, pullRequestScope: "user" }]);
  });

  it("removes a target without dropping remote subscriptions", () => {
    const baseline = { ...first, workflowTargets: [{ kind: "default" as const, workflowNames: ["CI"] }] };
    const remote = { ...baseline, pullRequestScope: "all" as const };

    expect(mergeSyncedStates(state([baseline]), state([first]), state([remote])).settings.watchedRepos)
      .toEqual([{ ...first, pullRequestScope: "all" }]);
  });

  it("merges dismissed PR additions and removals", () => {
    const baseline = state();
    baseline.settings.dismissedPullRequests = ["getsentry/sentry#1"];
    const local = state();
    local.settings.dismissedPullRequests = ["getsentry/sentry#2"];
    const remote = state();
    remote.settings.dismissedPullRequests = ["getsentry/sentry#1", "getsentry/relay#3"];

    expect(mergeSyncedStates(baseline, local, remote).settings.dismissedPullRequests)
      .toEqual(["getsentry/relay#3", "getsentry/sentry#2"]);
  });

  it("preserves remote order entries during a local reorder", () => {
    const baseline = state();
    baseline.settings.repoOrder = ["getsentry/sentry", "getsentry/relay"];
    const local = state();
    local.settings.repoOrder = ["getsentry/relay", "getsentry/sentry"];
    const remote = state();
    remote.settings.repoOrder = [...baseline.settings.repoOrder, "getsentry/seer"];

    expect(mergeSyncedStates(baseline, local, remote).settings.repoOrder)
      .toEqual(["getsentry/relay", "getsentry/sentry", "getsentry/seer"]);
  });

  it.each(["target", "repository"])("preserves remote workflow additions after local %s removal", (removal) => {
    const baseline = { ...first, workflowTargets: [{ kind: "default" as const, workflowNames: ["CI"] }] };
    const local = removal === "target" ? [first] : [];
    const remote = {
      ...baseline,
      workflowTargets: [{ kind: "default" as const, workflowNames: ["CI", "Lint"] }],
    };

    expect(mergeSyncedStates(state([baseline]), state(local), state([remote])).settings.watchedRepos)
      .toEqual([{
        owner: first.owner,
        repo: first.repo,
        ...(removal === "target" ? { pullRequestScope: first.pullRequestScope } : {}),
        workflowTargets: [{ kind: "default", workflowNames: ["Lint"] }],
      }]);
  });
});


describe("last repository subscription removal", () => {
  it("preserves a remotely added workflow when removing the last local subscription", () => {
    const current: WatchedRepo = {
      ...first, workflowTargets: [{ kind: "default", workflowNames: ["CI"] }],
    };

    expect(mergeSyncedStates(state([first]), state(), state([current])).settings.watchedRepos)
      .toEqual([{ owner: first.owner, repo: first.repo, workflowTargets: current.workflowTargets }]);
  });

  it("keeps a remote removal while adding an unrelated local workflow", () => {
    const edited: WatchedRepo = {
      ...first, workflowTargets: [{ kind: "default", workflowNames: ["CI"] }],
    };

    expect(mergeSyncedStates(state([first]), state([edited]), state()).settings.watchedRepos)
      .toEqual([{ owner: first.owner, repo: first.repo, workflowTargets: edited.workflowTargets }]);
  });
});
