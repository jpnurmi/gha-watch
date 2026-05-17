import { defaultAppSettings, normalizeAppSettings, type AppSettings } from "../domain/settings";
import type { WatchRecord } from "../domain/watches";

const watchesStorageKey = "gha-watch:watches";
const settingsStorageKey = "gha-watch:settings";

export function loadWatches(): WatchRecord[] {
  const rawWatches = localStorage.getItem(watchesStorageKey);

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
  localStorage.setItem(watchesStorageKey, JSON.stringify(watches));
}

export function loadSettings(): AppSettings {
  const rawSettings = localStorage.getItem(settingsStorageKey);

  if (!rawSettings) {
    return defaultAppSettings;
  }

  try {
    return normalizeAppSettings(JSON.parse(rawSettings));
  } catch {
    return defaultAppSettings;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  localStorage.setItem(settingsStorageKey, JSON.stringify(normalizeAppSettings(settings)));
}
