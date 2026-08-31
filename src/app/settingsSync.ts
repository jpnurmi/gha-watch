import { normalizeAppSettings } from "../domain/settings";
import {
  clearExpiredWatchSuppressions,
  normalizeWatchSuppressions,
  type WatchSuppression,
} from "../domain/watchSuppressions";
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
          const migratedState = toSyncedState({
            settings: remoteState.settings,
            watches: remoteState.historyInitialized === false
              ? localState.watches
              : remoteState.watches,
            watchSuppressions: combineWatchSuppressions(
              localState.watchSuppressions,
              remoteState.watchSuppressions,
            ),
          });

          const storedRemoteState: SyncedState = {
            settings: remoteState.settings,
            watches: remoteState.watches,
            watchSuppressions: remoteState.watchSuppressions ?? [],
          };

          if (!statesEqual(migratedState, storedRemoteState)) {
            await remote.save(migratedState);
          }

          return restoreLocalCaches(migratedState, localState);
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

  return toSyncedState({
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
    watchSuppressions: mergeWatchSuppressions(
      previous.watchSuppressions,
      local.watchSuppressions,
      remote.watchSuppressions,
    ),
  });
}

export function toSyncedState(state: SyncedState): SyncedState {
  const settings = normalizeAppSettings(state.settings);
  const syncedWatches = state.watches
    .filter((watch) => {
      const triageState = getWatchTriageState(watch);
      return triageState === "saved" || triageState === "done";
    })
    .map(({ repoIconUrl: _repoIconUrl, ...watch }) => watch);
  const watches = clearExpiredDoneWatches(syncedWatches);
  const watchIds = new Set(watches.map((watch) => watch.id));
  const now = new Date();
  const prunedDoneSuppressions = syncedWatches
    .filter(
      (watch) =>
        getWatchTriageState(watch) === "done" &&
        !watchIds.has(watch.id),
    )
    .map((watch) => ({
      id: watch.id,
      clearedAt: watch.doneAt ?? now.toISOString(),
    }));

  return {
    settings: {
      watchedRepos: settings.watchedRepos.map(({ repoIconUrl: _repoIconUrl, ...repo }) => repo),
      repoOrder: settings.repoOrder,
      dismissedPullRequests: settings.dismissedPullRequests,
    },
    watches,
    watchSuppressions: combineWatchSuppressions(
      normalizeWatchSuppressions(state.watchSuppressions),
      prunedDoneSuppressions,
    ).filter((suppression) => !watchIds.has(suppression.id)),
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
    watchSuppressions: normalizeWatchSuppressions(remoteState.watchSuppressions),
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
        const remoteWatch = merged.get(id);
        merged.set(
          id,
          remoteWatch ? mergeWatchTriage(localWatch, remoteWatch) : localWatch,
        );
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

function mergeWatchTriage(local: WatchRecord, remote: WatchRecord): WatchRecord {
  const merged: WatchRecord = {
    ...remote,
    triageState: getWatchTriageState(local),
  };

  if (local.doneAt) {
    merged.doneAt = local.doneAt;
  } else {
    delete merged.doneAt;
  }

  return merged;
}

function mergeWatchSuppressions(
  previousSuppressions: WatchSuppression[] = [],
  localSuppressions: WatchSuppression[] = [],
  remoteSuppressions: WatchSuppression[] = [],
): WatchSuppression[] {
  const previous = new Map(previousSuppressions.map((item) => [item.id, item]));
  const local = new Map(localSuppressions.map((item) => [item.id, item]));
  const merged = new Map(remoteSuppressions.map((item) => [item.id, item]));

  for (const id of new Set([...previous.keys(), ...local.keys()])) {
    const previousSuppression = previous.get(id);
    const localSuppression = local.get(id);

    if (statesEqual(previousSuppression, localSuppression)) {
      continue;
    }

    if (localSuppression) {
      merged.set(id, localSuppression);
    } else {
      merged.delete(id);
    }
  }

  return [...merged.values()];
}

function combineWatchSuppressions(
  localSuppressions: WatchSuppression[] = [],
  remoteSuppressions: WatchSuppression[] = [],
): WatchSuppression[] {
  const combined = new Map(remoteSuppressions.map((item) => [item.id, item]));

  for (const suppression of localSuppressions) {
    const existing = combined.get(suppression.id);

    if (!existing || Date.parse(suppression.clearedAt) > Date.parse(existing.clearedAt)) {
      combined.set(suppression.id, suppression);
    }
  }

  return clearExpiredWatchSuppressions([...combined.values()]);
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
