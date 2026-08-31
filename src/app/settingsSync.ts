import { normalizeAppSettings } from "../domain/settings";
import {
  clearExpiredDoneWatches,
  getWatchTriageState,
  type WatchRecord,
} from "../domain/watches";
import { getWatchedRepoKey, type WatchedRepo } from "../domain/watchedRepos";
import type { SettingsRemote, SyncedState } from "../platform/settingsGist";

export type SettingsSync = {
  acknowledge(state: SyncedState): void;
  push(state: SyncedState): Promise<void>;
  sync(localState: SyncedState): Promise<SyncedState>;
};

export function createSettingsSync(remote: SettingsRemote): SettingsSync {
  let pendingState: SyncedState | undefined;
  let previousLocalState: SyncedState | undefined;
  let queue = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function flushPendingState(): Promise<void> {
    while (pendingState) {
      const nextState = pendingState;
      const remoteState = await remote.load();
      const mergedState = previousLocalState && remoteState
        ? mergeSyncedStates(previousLocalState, nextState, remoteState)
        : nextState;

      if (!remoteState || !statesEqual(mergedState, remoteState)) {
        await remote.save(mergedState);
      }

      previousLocalState = nextState;

      if (pendingState === nextState) {
        pendingState = undefined;
      }
    }
  }

  return {
    acknowledge(state) {
      previousLocalState = toSyncedState(state);
    },

    push(state) {
      pendingState = toSyncedState(state);
      return enqueue(flushPendingState);
    },

    sync(localState) {
      return enqueue(async () => {
        previousLocalState = toSyncedState(localState);
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

export function mergeSyncedStates(
  previousLocalState: SyncedState,
  localState: SyncedState,
  remoteState: SyncedState,
): SyncedState {
  const previous = toSyncedState(previousLocalState);
  const local = toSyncedState(localState);
  const remote = toSyncedState(remoteState);

  return {
    settings: {
      watchedRepos: mergeChangedValue(
        previous.settings.watchedRepos,
        local.settings.watchedRepos,
        remote.settings.watchedRepos,
      ),
      repoOrder: mergeChangedValue(
        previous.settings.repoOrder,
        local.settings.repoOrder,
        remote.settings.repoOrder,
      ),
      dismissedPullRequests: mergeChangedValue(
        previous.settings.dismissedPullRequests,
        local.settings.dismissedPullRequests,
        remote.settings.dismissedPullRequests,
      ),
    },
    watches: mergeWatches(previous.watches, local.watches, remote.watches),
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

function mergeChangedValue<T>(previous: T, local: T, remote: T): T {
  return statesEqual(previous, local) ? remote : local;
}

function mergeWatches(
  previousWatches: WatchRecord[],
  localWatches: WatchRecord[],
  remoteWatches: WatchRecord[],
): WatchRecord[] {
  const previous = new Map(previousWatches.map((watch) => [watch.id, watch]));
  const local = new Map(localWatches.map((watch) => [watch.id, watch]));
  const merged = new Map(remoteWatches.map((watch) => [watch.id, watch]));
  const localIds = new Set([...previous.keys(), ...local.keys()]);

  for (const id of localIds) {
    const previousWatch = previous.get(id);
    const localWatch = local.get(id);

    if (getSyncedTriageState(previousWatch) !== getSyncedTriageState(localWatch)) {
      if (localWatch) {
        merged.set(id, localWatch);
      } else {
        merged.delete(id);
      }
      continue;
    }

    const remoteWatch = merged.get(id);

    if (previousWatch && localWatch && remoteWatch) {
      merged.set(id, mergeWatchChanges(previousWatch, localWatch, remoteWatch));
    }
  }

  const remoteOrder = remoteWatches.map((watch) => watch.id);
  const localOrder = localWatches.map((watch) => watch.id);
  const previousOrder = previousWatches.map((watch) => watch.id);
  const locallyReordered = !statesEqual(
    previousOrder.filter((id) => local.has(id)),
    localOrder.filter((id) => previous.has(id)),
  );
  const preferredOrder = locallyReordered ? localOrder : remoteOrder;
  const remainingOrder = locallyReordered ? remoteOrder : localOrder;

  return [...preferredOrder, ...remainingOrder]
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .flatMap((id) => {
      const watch = merged.get(id);
      return watch ? [watch] : [];
    });
}

function mergeWatchChanges(
  previous: WatchRecord,
  local: WatchRecord,
  remote: WatchRecord,
): WatchRecord {
  const merged = { ...remote } as Record<string, unknown>;
  const previousRecord = previous as unknown as Record<string, unknown>;
  const localRecord = local as unknown as Record<string, unknown>;
  const protectedKeys = new Set(["triageState", "doneAt"]);

  for (const key of new Set([...Object.keys(previousRecord), ...Object.keys(localRecord)])) {
    if (protectedKeys.has(key) || statesEqual(previousRecord[key], localRecord[key])) {
      continue;
    }

    if (Object.hasOwn(localRecord, key)) {
      merged[key] = localRecord[key];
    } else {
      delete merged[key];
    }
  }

  return merged as WatchRecord;
}

function getSyncedTriageState(watch: WatchRecord | undefined): "saved" | "done" | undefined {
  if (!watch) {
    return undefined;
  }

  const state = getWatchTriageState(watch);
  return state === "saved" || state === "done" ? state : undefined;
}

function statesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
