import { normalizeFavoriteRepos, type FavoriteRepo } from "./favorites";

export type AppSettings = {
  autoClearMergedPrWatches: boolean;
  favoriteRepos: FavoriteRepo[];
};

export const defaultAppSettings: AppSettings = {
  autoClearMergedPrWatches: false,
  favoriteRepos: [],
};

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!isSettingsRecord(value)) {
    return defaultAppSettings;
  }

  return {
    autoClearMergedPrWatches:
      typeof value.autoClearMergedPrWatches === "boolean"
        ? value.autoClearMergedPrWatches
        : defaultAppSettings.autoClearMergedPrWatches,
    favoriteRepos: normalizeFavoriteRepos(value.favoriteRepos),
  };
}

function isSettingsRecord(value: unknown): value is Partial<AppSettings> {
  return typeof value === "object" && value !== null;
}
