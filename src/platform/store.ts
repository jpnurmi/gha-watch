import type { WatchRecord } from "../domain/watches";

const storageKey = "gha-watch:watches";

export function loadWatches(): WatchRecord[] {
  const rawWatches = localStorage.getItem(storageKey);

  if (!rawWatches) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawWatches);
    return Array.isArray(parsed) ? (parsed as WatchRecord[]) : [];
  } catch {
    return [];
  }
}

export async function saveWatches(watches: WatchRecord[]): Promise<void> {
  localStorage.setItem(storageKey, JSON.stringify(watches));
}
