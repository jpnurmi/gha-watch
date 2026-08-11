import { normalizeWatchedRepos, type WatchedRepo } from "./watchedRepos";
import { normalizeRepoOrder } from "./repoOrder";

export type AppSettings = {
  watchedRepos: WatchedRepo[];
  repoOrder: string[];
};

export const defaultAppSettings: AppSettings = {
  watchedRepos: [],
  repoOrder: [],
};

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!isSettingsRecord(value)) {
    return defaultAppSettings;
  }

  return {
    watchedRepos: normalizeWatchedRepos(value.watchedRepos),
    repoOrder: normalizeRepoOrder(value.repoOrder),
  };
}

function isSettingsRecord(value: unknown): value is Partial<AppSettings> & Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
