import type { ParsedWatchTarget } from "../domain/githubUrl";
import { formatWatchState, getStatusTransition, isTerminalStatus } from "../domain/status";
import {
  addWatch,
  getWatchId,
  markAllWatchesSeen,
  markWatchSeen,
  normalizeWatchSeenStatus,
  removeWatch,
  type WatchRecord,
} from "../domain/watches";
import type { WatchSnapshot } from "../platform/gh";

export type WatchNotification = {
  title: string;
  body: string;
};

export type WatchControllerDeps = {
  fetchState(target: ParsedWatchTarget): Promise<WatchSnapshot>;
  notify(notification: WatchNotification): Promise<void>;
  save(watches: WatchRecord[]): Promise<void>;
};

export type WatchController = {
  add(target: ParsedWatchTarget): Promise<void>;
  remove(id: string): void;
  markSeen(id: string): void;
  markAllSeen(): void;
  clearAll(): void;
  clearFinished(): void;
  pollNow(): Promise<void>;
  getWatches(): WatchRecord[];
  subscribe(listener: () => void): () => void;
};

export function createWatchController(
  deps: WatchControllerDeps,
  initialWatches: WatchRecord[] = [],
): WatchController {
  let watches: WatchRecord[] = initialWatches.map(normalizeWatchSeenStatus);
  const listeners = new Set<() => void>();

  function emitChange(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function setWatches(nextWatches: WatchRecord[]): void {
    watches = nextWatches;
    void deps.save(watches);
    emitChange();
  }

  function updateWatch(id: string, update: (watch: WatchRecord) => WatchRecord): void {
    setWatches(watches.map((watch) => (watch.id === id ? update(watch) : watch)));
  }

  return {
    async add(target) {
      const previous = watches;
      const next = addWatch(watches, target);

      if (next === previous) {
        return;
      }

      setWatches(next);

      const id = getWatchId(target);

      try {
        const snapshot = await deps.fetchState(target);
        const status = formatWatchState(snapshot);
        updateWatch(id, (watch) => ({
          ...watch,
          label: snapshot.title,
          status,
          lastSeenStatus: status,
          lastState: {
            status: snapshot.status,
            conclusion: snapshot.conclusion,
          },
          active: !isTerminalStatus(snapshot),
          error: undefined,
        }));
      } catch (error) {
        updateWatch(id, (watch) => ({
          ...watch,
          status: "error",
          lastSeenStatus: "error",
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    },

    remove(id) {
      setWatches(removeWatch(watches, id));
    },

    markSeen(id) {
      setWatches(markWatchSeen(watches, id));
    },

    markAllSeen() {
      setWatches(markAllWatchesSeen(watches));
    },

    clearAll() {
      setWatches([]);
    },

    clearFinished() {
      setWatches(watches.filter((watch) => watch.active));
    },

    async pollNow() {
      const activeWatches = watches.filter((watch) => watch.active);

      for (const watch of activeWatches) {
        const snapshot = await deps.fetchState(watch.target);
        const nextState = {
          status: snapshot.status,
          conclusion: snapshot.conclusion,
        };
        const status = formatWatchState(nextState);
        const transition = getStatusTransition(watch.lastState, nextState);

        updateWatch(watch.id, (current) => ({
          ...current,
          label: snapshot.title,
          status,
          lastSeenStatus: current.lastSeenStatus ?? current.status,
          lastState: nextState,
          active: !isTerminalStatus(nextState),
          error: undefined,
        }));

        if (transition.notify) {
          await deps.notify({
            title: snapshot.title,
            body: transition.message,
          });
        }
      }
    },

    getWatches() {
      return watches;
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
