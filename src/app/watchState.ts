import { getWatchTriageState, type WatchRecord } from "../domain/watches";
import { createPersistenceQueue } from "./persistenceQueue";

export function createWatchState(initial: WatchRecord[], save: (watches: WatchRecord[]) => Promise<void>) {
  let watches = initial;
  let generation = 0;
  const reads = new Map<string, number>();
  const listeners = new Set<() => void>();
  const persistence = createPersistenceQueue(save);

  return {
    get: () => watches,
    set(next: WatchRecord[]) {
      if (next === watches) return;
      const byId = new Map(next.map((watch) => [watch.id, watch]));
      for (const watch of watches) {
        const updated = byId.get(watch.id);
        if (!updated || updated.lastState !== watch.lastState || getWatchTriageState(updated) !== getWatchTriageState(watch)) {
          reads.delete(watch.id);
        }
      }
      watches = next;
      persistence.write(watches);
      for (const listener of listeners) listener();
    },
    beginRead(id: string) {
      const read = ++generation;
      reads.set(id, read);
      return read;
    },
    isCurrentRead: (id: string, read: number) => reads.get(id) === read,
    invalidateRead: (id: string) => { reads.delete(id); },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    persist: () => persistence.write(watches),
    flush: () => persistence.flush(),
  };
}
