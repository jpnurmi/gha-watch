import { normalizeWatchedRepos, type WatchedRepo } from "./watchedRepos";
import { normalizeRepoOrder } from "./repoOrder";

export type AppSettings = {
  autoClearFinishedWatches: boolean;
  watchedRepos: WatchedRepo[];
  repoOrder: string[];
};

export const defaultAppSettings: AppSettings = {
  autoClearFinishedWatches: false,
  watchedRepos: [],
  repoOrder: [],
};

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!isSettingsRecord(value)) {
    return defaultAppSettings;
  }

  return {
    autoClearFinishedWatches: normalizeAutoClearFinishedWatches(value),
    watchedRepos: normalizeWatchedRepos(value.watchedRepos),
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
