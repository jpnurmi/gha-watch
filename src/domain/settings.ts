import { normalizeFavoriteRepos, type FavoriteRepo } from "./favorites";
import { normalizeRepoOrder } from "./repoOrder";

export type AppSettings = {
  autoClearFinishedWatches: boolean;
  favoriteRepos: FavoriteRepo[];
  repoOrder: string[];
};

export const defaultAppSettings: AppSettings = {
  autoClearFinishedWatches: false,
  favoriteRepos: [],
  repoOrder: [],
};

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!isSettingsRecord(value)) {
    return defaultAppSettings;
  }

  return {
    autoClearFinishedWatches: normalizeAutoClearFinishedWatches(value),
    favoriteRepos: normalizeFavoriteRepos(value.favoriteRepos),
    repoOrder: normalizeRepoOrder(value.repoOrder),
  };
}

function isSettingsRecord(value: unknown): value is Partial<AppSettings> & Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeAutoClearFinishedWatches(value: Partial<AppSettings> & Record<string, unknown>): boolean {
  if (typeof value.autoClearFinishedWatches === "boolean") {
    return value.autoClearFinishedWatches;
  }

  return typeof value.autoClearMergedPrWatches === "boolean"
    ? value.autoClearMergedPrWatches
    : defaultAppSettings.autoClearFinishedWatches;
}
