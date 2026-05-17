import { normalizeFavoriteRepos, type FavoriteRepo } from "./favorites";
import { normalizeRepoOrder } from "./repoOrder";

export type AppSettings = {
  autoClearMergedPrWatches: boolean;
  favoriteRepos: FavoriteRepo[];
  repoOrder: string[];
};

export const defaultAppSettings: AppSettings = {
  autoClearMergedPrWatches: false,
  favoriteRepos: [],
  repoOrder: [],
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
    repoOrder: normalizeRepoOrder(value.repoOrder),
  };
}

function isSettingsRecord(value: unknown): value is Partial<AppSettings> {
  return typeof value === "object" && value !== null;
}
