import { normalizeAppSettings } from "../domain/settings";
import {
  clearExpiredDoneWatches,
  getWatchTriageState,
  type WatchRecord,
} from "../domain/watches";
import { getWatchedRepoKey, type WatchedRepo } from "../domain/watchedRepos";
import type { SettingsRemote, SyncedState } from "../platform/settingsGist";

export type SettingsSync = {
  push(state: SyncedState): Promise<void>;
  sync(localState: SyncedState): Promise<SyncedState>;
};

export function createSettingsSync(remote: SettingsRemote): SettingsSync {
  let pendingState: SyncedState | undefined;
  let queue = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function flushPendingState(): Promise<void> {
    while (pendingState) {
      const nextState = pendingState;
      await remote.save(nextState);

      if (pendingState === nextState) {
        pendingState = undefined;
      }
    }
  }

  return {
    push(state) {
      pendingState = toSyncedState(state);
      return enqueue(flushPendingState);
    },

    sync(localState) {
      return enqueue(async () => {
        await flushPendingState();
        const remoteState = await remote.load();

        if (remoteState) {
          if (remoteState.historyInitialized === false) {
            const migratedState = toSyncedState({
              settings: remoteState.settings,
              watches: localState.watches,
            });
            await remote.save(migratedState);
            return restoreLocalCaches(migratedState, localState);
          }

          return restoreLocalCaches(remoteState, localState);
        }

        const initialState = toSyncedState(localState);
        await remote.save(initialState);
        return restoreLocalCaches(initialState, localState);
      });
    },
  };
}

export function toSyncedState(state: SyncedState): SyncedState {
  const settings = normalizeAppSettings(state.settings);

  return {
    settings: {
      watchedRepos: settings.watchedRepos.map(({ repoIconUrl: _repoIconUrl, ...repo }) => repo),
      repoOrder: settings.repoOrder,
      dismissedPullRequests: settings.dismissedPullRequests,
    },
    watches: clearExpiredDoneWatches(state.watches)
      .filter((watch) => {
        const triageState = getWatchTriageState(watch);
        return triageState === "saved" || triageState === "done";
      })
      .map(({ repoIconUrl: _repoIconUrl, ...watch }) => watch),
  };
}

export function restoreLocalCaches(
  remoteState: SyncedState,
  localState: SyncedState,
): SyncedState {
  const localRepoIcons = new Map(
    normalizeAppSettings(localState.settings).watchedRepos
      .filter((repo): repo is WatchedRepo & { repoIconUrl: string } => Boolean(repo.repoIconUrl))
      .map((repo) => [getWatchedRepoKey(repo), repo.repoIconUrl]),
  );
  const localWatchIcons = new Map(
    localState.watches
      .filter((watch): watch is WatchRecord & { repoIconUrl: string } => Boolean(watch.repoIconUrl))
      .map((watch) => [watch.id, watch.repoIconUrl]),
  );
  const remoteSettings = normalizeAppSettings(remoteState.settings);

  return {
    settings: {
      ...remoteSettings,
      watchedRepos: remoteSettings.watchedRepos.map((repo) => {
        const repoIconUrl = localRepoIcons.get(getWatchedRepoKey(repo));
        return repoIconUrl ? { ...repo, repoIconUrl } : repo;
      }),
    },
    watches: remoteState.watches.map((watch) => {
      const repoIconUrl = localWatchIcons.get(watch.id);
      return repoIconUrl ? { ...watch, repoIconUrl } : watch;
    }),
  };
}
