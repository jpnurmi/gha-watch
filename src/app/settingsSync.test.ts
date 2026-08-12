import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../domain/settings";
import type { SettingsRemote } from "../platform/settingsGist";
import { createSettingsSync, restoreLocalRepoIcons, toSyncedSettings } from "./settingsSync";

const localSettings: AppSettings = {
  watchedRepos: [
    {
      owner: "jpnurmi",
      repo: "gha-watch",
      repoIconUrl: "https://avatars.example/jpnurmi.png",
      pullRequestScope: "user",
    },
  ],
  repoOrder: ["jpnurmi/gha-watch"],
};

const remoteSettings: AppSettings = {
  watchedRepos: [
    { owner: "jpnurmi", repo: "gha-watch", pullRequestScope: "all" },
    { owner: "getsentry", repo: "sentry", pullRequestScope: "user" },
  ],
  repoOrder: ["getsentry/sentry", "jpnurmi/gha-watch"],
};

describe("settings sync", () => {
  it("uses the whole remote document while preserving local icon caches", async () => {
    const remote: SettingsRemote = {
      load: vi.fn(async () => remoteSettings),
      save: vi.fn(async () => undefined),
    };

    await expect(createSettingsSync(remote).sync(localSettings)).resolves.toEqual({
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
    });
    expect(remote.save).not.toHaveBeenCalled();
  });

  it("creates the initial remote document without local icon caches", async () => {
    const remote: SettingsRemote = {
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    };

    await createSettingsSync(remote).sync(localSettings);

    expect(remote.save).toHaveBeenCalledWith({
      watchedRepos: [
        { owner: "jpnurmi", repo: "gha-watch", pullRequestScope: "user" },
      ],
      repoOrder: ["jpnurmi/gha-watch"],
    });
  });

  it("keeps a failed explicit upload pending for the next sync", async () => {
    let storedSettings: AppSettings | undefined;
    let shouldFail = true;
    const remote: SettingsRemote = {
      async load() {
        return storedSettings;
      },
      async save(settings) {
        if (shouldFail) {
          shouldFail = false;
          throw new Error("offline");
        }

        storedSettings = settings;
      },
    };
    const sync = createSettingsSync(remote);

    await expect(sync.push(localSettings)).rejects.toThrow("offline");
    await expect(sync.sync(localSettings)).resolves.toEqual(localSettings);
    expect(storedSettings).toEqual(toSyncedSettings(localSettings));
  });

  it("finishes rapid explicit uploads with the latest whole document", async () => {
    let releaseFirstSave: (() => void) | undefined;
    let firstSaveStarted: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstSaveStarted = resolve;
    });
    const saved: AppSettings[] = [];
    const remote: SettingsRemote = {
      async load() {
        return saved.at(-1);
      },
      async save(settings) {
        saved.push(settings);

        if (saved.length === 1) {
          firstSaveStarted?.();
          await firstSave;
        }
      },
    };
    const sync = createSettingsSync(remote);
    const firstPush = sync.push(localSettings);
    await started;
    const secondPush = sync.push(remoteSettings);

    releaseFirstSave?.();
    await Promise.all([firstPush, secondPush]);

    expect(saved.at(-1)).toEqual(toSyncedSettings(remoteSettings));
  });
});

describe("settings sync helpers", () => {
  it("strips repository icon caches from synced settings", () => {
    expect(toSyncedSettings(localSettings).watchedRepos[0]).not.toHaveProperty("repoIconUrl");
  });

  it("restores icons only for repositories present on both machines", () => {
    expect(restoreLocalRepoIcons(remoteSettings, localSettings).watchedRepos).toEqual([
      {
        owner: "jpnurmi",
        repo: "gha-watch",
        repoIconUrl: "https://avatars.example/jpnurmi.png",
        pullRequestScope: "all",
      },
      { owner: "getsentry", repo: "sentry", pullRequestScope: "user" },
    ]);
  });
});
