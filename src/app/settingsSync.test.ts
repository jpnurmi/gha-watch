import { describe, expect, it, vi } from "vitest";
import type { WatchRecord, WatchTriageState } from "../domain/watches";
import type { SettingsRemote, SyncedState } from "../platform/settingsGist";
import {
  createSettingsSync,
  mergeSyncedStates,
  restoreLocalCaches,
  toSyncedState,
} from "./settingsSync";

function watch(id: string, triageState: WatchTriageState, repoIconUrl?: string): WatchRecord {
  return {
    id: `jpnurmi/gha-watch/run/${id}`,
    target: {
      kind: "run",
      owner: "jpnurmi",
      repo: "gha-watch",
      runId: id,
      url: `https://github.com/jpnurmi/gha-watch/actions/runs/${id}`,
    },
    label: `Run ${id}`,
    status: "completed:success",
    lastSeenStatus: "completed:success",
    lastState: { status: "completed", conclusion: "success" },
    ...(repoIconUrl ? { repoIconUrl } : {}),
    triageState,
    ...(triageState === "done" ? { doneAt: "2026-08-10T00:00:00.000Z" } : {}),
    active: false,
    error: undefined,
  };
}

const localState: SyncedState = {
  settings: {
    watchedRepos: [
      {
        owner: "jpnurmi",
        repo: "gha-watch",
        repoIconUrl: "https://avatars.example/jpnurmi.png",
        pullRequestScope: "user",
      },
    ],
    repoOrder: ["jpnurmi/gha-watch"],
    dismissedPullRequests: ["getsentry/relay#123"],
  },
  watches: [
    watch("1", "inbox"),
    watch("2", "saved", "https://avatars.example/watch.png"),
  ],
};

const remoteState: SyncedState = {
  settings: {
    watchedRepos: [
      { owner: "jpnurmi", repo: "gha-watch", pullRequestScope: "all" },
      { owner: "getsentry", repo: "sentry", pullRequestScope: "user" },
    ],
    repoOrder: ["getsentry/sentry", "jpnurmi/gha-watch"],
    dismissedPullRequests: ["getsentry/seer#456"],
  },
  watches: [watch("2", "done"), watch("3", "saved")],
};

describe("settings sync", () => {
  it("uses the whole remote state while preserving local icon caches", async () => {
    const remote: SettingsRemote = {
      load: vi.fn(async () => remoteState),
      save: vi.fn(async () => undefined),
    };

    await expect(createSettingsSync(remote).sync(localState)).resolves.toEqual({
      settings: {
        watchedRepos: [
          {
            owner: "jpnurmi",
            repo: "gha-watch",
            repoIconUrl: "https://avatars.example/jpnurmi.png",
            pullRequestScope: "all",
          },
          { owner: "getsentry", repo: "sentry", pullRequestScope: "user" },
        ],
        repoOrder: ["getsentry/sentry", "jpnurmi/gha-watch"],
        dismissedPullRequests: ["getsentry/seer#456"],
      },
      watches: [
        { ...watch("2", "done"), repoIconUrl: "https://avatars.example/watch.png" },
        watch("3", "saved"),
      ],
      watchSuppressions: [],
    });
    expect(remote.save).not.toHaveBeenCalled();
  });

  it("creates the initial remote state without inbox watches or icon caches", async () => {
    const remote: SettingsRemote = {
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    };

    await createSettingsSync(remote).sync(localState);

    expect(remote.save).toHaveBeenCalledWith({
      settings: {
        watchedRepos: [
          { owner: "jpnurmi", repo: "gha-watch", pullRequestScope: "user" },
        ],
        repoOrder: ["jpnurmi/gha-watch"],
        dismissedPullRequests: ["getsentry/relay#123"],
      },
      watches: [watch("2", "saved")],
      watchSuppressions: [],
    });
  });

  it("seeds local history when upgrading a settings-only Gist", async () => {
    const remote: SettingsRemote = {
      load: vi.fn(async () => ({
        settings: remoteState.settings,
        watches: [],
        historyInitialized: false,
      })),
      save: vi.fn(async () => undefined),
    };

    const synced = await createSettingsSync(remote).sync(localState);

    expect(remote.save).toHaveBeenCalledWith({
      settings: remoteState.settings,
      watches: [watch("2", "saved")],
      watchSuppressions: [],
    });
    expect(synced.watches).toEqual([
      { ...watch("2", "saved"), repoIconUrl: "https://avatars.example/watch.png" },
    ]);
  });

  it("keeps a failed explicit upload pending for the next sync", async () => {
    let storedState: SyncedState | undefined;
    let shouldFail = true;
    const remote: SettingsRemote = {
      async load() {
        return storedState;
      },
      async save(state) {
        if (shouldFail) {
          shouldFail = false;
          throw new Error("offline");
        }

        storedState = state;
      },
    };
    const sync = createSettingsSync(remote);

    await expect(sync.push(localState)).rejects.toThrow("offline");
    await expect(sync.sync(localState)).resolves.toEqual(
      restoreLocalCaches(toSyncedState(localState), localState),
    );
    expect(storedState).toEqual(toSyncedState(localState));
  });

  it("finishes rapid explicit uploads with the latest whole state", async () => {
    let releaseFirstSave: (() => void) | undefined;
    let firstSaveStarted: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstSaveStarted = resolve;
    });
    const saved: SyncedState[] = [];
    const remote: SettingsRemote = {
      async load() {
        return saved.at(-1);
      },
      async save(state) {
        saved.push(state);

        if (saved.length === 1) {
          firstSaveStarted?.();
          await firstSave;
        }
      },
    };
    const sync = createSettingsSync(remote);
    const firstPush = sync.push(localState);
    await started;
    const secondPush = sync.push(remoteState);

    releaseFirstSave?.();
    await Promise.all([firstPush, secondPush]);

    expect(saved.at(-1)).toEqual(toSyncedState(remoteState));
  });

  it("preserves remote triage changes when uploading a different local change", async () => {
    let storedState = toSyncedState(localState);
    const remote: SettingsRemote = {
      async load() {
        return storedState;
      },
      async save(state) {
        storedState = state;
      },
    };
    const sync = createSettingsSync(remote);
    await sync.sync(localState);

    storedState = {
      ...storedState,
      watches: [watch("2", "done")],
    };
    await sync.push({
      ...localState,
      watches: [...localState.watches, watch("3", "done")],
    });

    expect(storedState.watches).toEqual([watch("2", "done"), watch("3", "done")]);
  });

  it("merges sequential changes from two clients", async () => {
    let storedState = toSyncedState({
      ...localState,
      watches: [watch("2", "saved"), watch("3", "saved")],
    });
    const remote: SettingsRemote = {
      async load() {
        return storedState;
      },
      async save(state) {
        storedState = state;
      },
    };
    const firstClient = createSettingsSync(remote);
    const secondClient = createSettingsSync(remote);
    await firstClient.sync(storedState);
    await secondClient.sync(storedState);

    await firstClient.push({
      ...storedState,
      watches: [watch("2", "done"), watch("3", "saved")],
    });
    await secondClient.push({
      ...storedState,
      watches: [watch("2", "saved"), watch("3", "done")],
    });

    expect(storedState.watches).toEqual([watch("2", "done"), watch("3", "done")]);
  });

  it("merges a local change queued while a remote refresh starts", async () => {
    let storedState = toSyncedState(localState);
    const remote: SettingsRemote = {
      async load() {
        return storedState;
      },
      async save(state) {
        storedState = state;
      },
    };
    const sync = createSettingsSync(remote);
    await sync.sync(localState);

    storedState = {
      ...storedState,
      watches: [watch("2", "done")],
    };
    const refresh = sync.sync(localState);
    const upload = sync.push({
      ...localState,
      watches: [...localState.watches, watch("3", "done")],
    });
    await Promise.all([refresh, upload]);

    expect(storedState.watches).toEqual([watch("2", "done"), watch("3", "done")]);
  });

  it("adds local pruned-Done suppressions to existing remote history", async () => {
    let storedState = toSyncedState(remoteState);
    const remote: SettingsRemote = {
      async load() {
        return storedState;
      },
      async save(state) {
        storedState = state;
      },
    };
    const suppression = {
      id: "jpnurmi/gha-watch/pull/overflow",
      clearedAt: "2026-08-31T12:00:00.000Z",
    };

    await createSettingsSync(remote).sync({
      ...localState,
      watchSuppressions: [suppression],
    });

    expect(storedState.watchSuppressions).toEqual([suppression]);
  });

  it("persists suppressions when remote Done history exceeds its visible limit", async () => {
    const doneWatches = Array.from(
      { length: 101 },
      (_, index) => watch(String(index + 1), "done"),
    );
    let storedState: SyncedState = {
      ...remoteState,
      watches: doneWatches,
    };
    const remote: SettingsRemote = {
      async load() {
        return storedState;
      },
      async save(state) {
        storedState = state;
      },
    };

    await createSettingsSync(remote).sync(localState);

    expect(storedState.watches).toHaveLength(100);
    expect(storedState.watchSuppressions).toEqual([
      {
        id: "jpnurmi/gha-watch/run/101",
        clearedAt: "2026-08-10T00:00:00.000Z",
      },
    ]);
  });
});

describe("settings sync helpers", () => {
  it("keeps only saved and done watches in the remote state", () => {
    expect(toSyncedState({
      ...localState,
      watches: [...localState.watches, watch("3", "done")],
    }).watches).toEqual([watch("2", "saved"), watch("3", "done")]);
  });

  it("restores icons only for matching remote records", () => {
    expect(restoreLocalCaches(remoteState, localState).watches).toEqual([
      { ...watch("2", "done"), repoIconUrl: "https://avatars.example/watch.png" },
      watch("3", "saved"),
    ]);
  });

  it("merges local removals with unrelated remote triage changes", () => {
    const previous = {
      ...localState,
      watches: [watch("2", "saved"), watch("3", "saved")],
    };
    const local = {
      ...previous,
      watches: [watch("3", "saved")],
    };
    const remote = {
      ...previous,
      watches: [watch("2", "saved"), watch("3", "done")],
    };

    expect(mergeSyncedStates(previous, local, remote).watches).toEqual([
      watch("3", "done"),
    ]);
  });

  it("keeps a remote triage transition while applying local cache updates", () => {
    const previousWatch = watch("2", "saved");
    const localWatch = { ...previousWatch, status: "completed:failure" };
    const remoteWatch = watch("2", "done");

    expect(mergeSyncedStates(
      { ...localState, watches: [previousWatch] },
      { ...localState, watches: [localWatch] },
      { ...localState, watches: [remoteWatch] },
    ).watches).toEqual([
      { ...remoteWatch, status: "completed:failure" },
    ]);
  });

  it("keeps remote cache updates during a local triage transition", () => {
    const previousWatch = watch("2", "saved");
    const localWatch = watch("2", "done");
    const remoteWatch: WatchRecord = {
      ...previousWatch,
      status: "completed:failure",
      lastSeenStatus: "completed:failure",
      lastState: { status: "completed", conclusion: "failure" },
      error: "Remote refresh failed",
      errorKind: "transient",
      errorAt: "2026-08-31T12:01:00.000Z",
    };

    expect(mergeSyncedStates(
      { ...localState, watches: [previousWatch] },
      { ...localState, watches: [localWatch] },
      { ...remoteState, watches: [remoteWatch] },
    ).watches).toEqual([
      {
        ...remoteWatch,
        triageState: "done",
        doneAt: localWatch.doneAt,
      },
    ]);
  });

  it("merges unrelated local and remote suppressions", () => {
    const localSuppression = {
      id: "jpnurmi/gha-watch/pull/local",
      clearedAt: "2026-08-31T12:00:00.000Z",
    };
    const remoteSuppression = {
      id: "jpnurmi/gha-watch/pull/remote",
      clearedAt: "2026-08-31T12:01:00.000Z",
    };

    expect(mergeSyncedStates(
      { ...localState, watchSuppressions: [] },
      { ...localState, watchSuppressions: [localSuppression] },
      { ...remoteState, watchSuppressions: [remoteSuppression] },
    ).watchSuppressions).toEqual([remoteSuppression, localSuppression]);
  });

  it("removes a remote suppression cleared locally", () => {
    const suppression = {
      id: "jpnurmi/gha-watch/pull/reactivated",
      clearedAt: "2026-08-31T12:00:00.000Z",
    };

    expect(mergeSyncedStates(
      { ...localState, watchSuppressions: [suppression] },
      { ...localState, watchSuppressions: [] },
      { ...remoteState, watchSuppressions: [suppression] },
    ).watchSuppressions).toEqual([]);
  });
});
