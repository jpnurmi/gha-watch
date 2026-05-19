import { hasUnseenStatusChange, type WatchRecord } from "../domain/watches";

export function getClickedUnseenWatchId(watches: WatchRecord[], id: string | undefined): string | undefined {
  return getClickedUnseenWatchIds(watches, id)[0];
}

export function getClickedUnseenWatchIds(
  watches: WatchRecord[],
  id: string | undefined,
  rowIds: string[] = [],
): string[] {
  if (rowIds.length > 0) {
    const rowIdSet = new Set(rowIds);

    return watches
      .filter((item) => rowIdSet.has(item.id) && hasUnseenStatusChange(item))
      .map((item) => item.id);
  }

  if (!id) {
    return [];
  }

  const watch = watches.find((item) => item.id === id);

  return watch && hasUnseenStatusChange(watch) ? [watch.id] : [];
}
