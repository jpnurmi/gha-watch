import type { ParsedWatchTarget } from "../domain/githubUrl";
import { formatWatchState, getStatusTransition, isTerminalStatus } from "../domain/status";
import { addWatch, getWatchId, removeWatch, type WatchRecord } from "../domain/watches";
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
  pollNow(): Promise<void>;
  getWatches(): WatchRecord[];
  subscribe(listener: () => void): () => void;
};

export function createWatchController(
  deps: WatchControllerDeps,
  initialWatches: WatchRecord[] = [],
): WatchController {
  let watches: WatchRecord[] = initialWatches;
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
        updateWatch(id, (watch) => ({
          ...watch,
          status: formatWatchState(snapshot),
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
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    },

    remove(id) {
      setWatches(removeWatch(watches, id));
    },

    async pollNow() {
      const activeWatches = watches.filter((watch) => watch.active);

      for (const watch of activeWatches) {
        const snapshot = await deps.fetchState(watch.target);
        const nextState = {
          status: snapshot.status,
          conclusion: snapshot.conclusion,
        };
        const transition = getStatusTransition(watch.lastState, nextState);

        updateWatch(watch.id, (current) => ({
          ...current,
          status: formatWatchState(nextState),
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
