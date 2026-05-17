import { hasUnseenStatusChange, type WatchRecord } from "../domain/watches";

export function getHoveredUnseenWatchId(watches: WatchRecord[], id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }

  const watch = watches.find((item) => item.id === id);

  return watch && hasUnseenStatusChange(watch) ? watch.id : undefined;
}
