import { defaultAppSettings, normalizeAppSettings, type AppSettings } from "../domain/settings";
import {
  normalizeWatchSuppressions,
  type WatchSuppression,
} from "../domain/watchSuppressions";
import { normalizeWatchCheckPreferences, type WatchRecord } from "../domain/watches";

const watchesStorageKey = "gha-watch:watches";
const watchSuppressionsStorageKey = "gha-watch:watch-suppressions";
const settingsStorageKey = "gha-watch:settings";

export function loadWatches(): WatchRecord[] {
  const rawWatches = localStorage.getItem(watchesStorageKey);

  if (!rawWatches) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawWatches);
    return Array.isArray(parsed)
      ? parsed
          .filter((watch): watch is WatchRecord => typeof watch === "object" && watch !== null)
          .map(normalizeWatchCheckPreferences)
      : [];
  } catch {
    return [];
  }
}

export async function saveWatches(watches: WatchRecord[]): Promise<void> {
  localStorage.setItem(watchesStorageKey, JSON.stringify(watches));
}

export function loadWatchSuppressions(): WatchSuppression[] {
  const rawSuppressions = localStorage.getItem(watchSuppressionsStorageKey);

  if (!rawSuppressions) {
    return [];
  }

  try {
    return normalizeWatchSuppressions(JSON.parse(rawSuppressions));
  } catch {
    return [];
  }
}

export async function saveWatchSuppressions(
  suppressions: WatchSuppression[],
): Promise<void> {
  localStorage.setItem(watchSuppressionsStorageKey, JSON.stringify(suppressions));
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
