import { describe, expect, it, vi } from "vitest";
import type { WatchRecord, WatchTriageState } from "../domain/watches";
import type { SettingsRemote, SyncedState } from "../platform/settingsGist";
import { createSettingsSync, restoreLocalCaches, toSyncedState } from "./settingsSync";

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
      },
      watches: [
        { ...watch("2", "done"), repoIconUrl: "https://avatars.example/watch.png" },
        watch("3", "saved"),
      ],
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
      },
      watches: [watch("2", "saved")],
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

  it("retains normalized per-PR ignored check keys in synced history", () => {
    const savedPr: WatchRecord = {
      ...watch("51", "saved"),
      id: "jpnurmi/gha-watch/pull/51",
      target: {
        kind: "pr",
        owner: "jpnurmi",
        repo: "gha-watch",
        prNumber: "51",
        url: "https://github.com/jpnurmi/gha-watch/pull/51",
      },
      ignoredCheckKeys: ["malformed", "check:v1:github-actions:ci:flaky"],
    };

    expect(toSyncedState({ ...localState, watches: [savedPr] }).watches[0]).toMatchObject({
      ignoredCheckKeys: ["check:v1:github-actions:ci:flaky"],
    });
  });
});
