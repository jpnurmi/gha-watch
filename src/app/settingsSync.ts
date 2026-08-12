import { normalizeAppSettings, type AppSettings } from "../domain/settings";
import { getWatchedRepoKey, type WatchedRepo } from "../domain/watchedRepos";
import type { SettingsRemote } from "../platform/settingsGist";

export type SettingsSync = {
  push(settings: AppSettings): Promise<void>;
  sync(localSettings: AppSettings): Promise<AppSettings>;
};

export function createSettingsSync(remote: SettingsRemote): SettingsSync {
  let pendingSettings: AppSettings | undefined;
  let queue = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function flushPendingSettings(): Promise<void> {
    while (pendingSettings) {
      const nextSettings = pendingSettings;
      await remote.save(nextSettings);

      if (pendingSettings === nextSettings) {
        pendingSettings = undefined;
      }
    }
  }

  return {
    push(settings) {
      pendingSettings = toSyncedSettings(settings);
      return enqueue(flushPendingSettings);
    },

    sync(localSettings) {
      return enqueue(async () => {
        await flushPendingSettings();
        const remoteSettings = await remote.load();

        if (remoteSettings) {
          return restoreLocalRepoIcons(remoteSettings, localSettings);
        }

        const initialSettings = toSyncedSettings(localSettings);
        await remote.save(initialSettings);
        return restoreLocalRepoIcons(initialSettings, localSettings);
      });
    },
  };
}

export function toSyncedSettings(settings: AppSettings): AppSettings {
  const normalized = normalizeAppSettings(settings);

  return {
    watchedRepos: normalized.watchedRepos.map(({ repoIconUrl: _repoIconUrl, ...repo }) => repo),
    repoOrder: normalized.repoOrder,
  };
}

export function restoreLocalRepoIcons(
  remoteSettings: AppSettings,
  localSettings: AppSettings,
): AppSettings {
  const localIcons = new Map(
    normalizeAppSettings(localSettings).watchedRepos
      .filter((repo): repo is WatchedRepo & { repoIconUrl: string } => Boolean(repo.repoIconUrl))
      .map((repo) => [getWatchedRepoKey(repo), repo.repoIconUrl]),
  );
  const remote = normalizeAppSettings(remoteSettings);

  return {
    ...remote,
    watchedRepos: remote.watchedRepos.map((repo) => {
      const repoIconUrl = localIcons.get(getWatchedRepoKey(repo));
      return repoIconUrl ? { ...repo, repoIconUrl } : repo;
    }),
  };
}
