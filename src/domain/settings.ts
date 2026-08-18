import { normalizeWatchedRepos, type WatchedRepo } from "./watchedRepos";
import { normalizeRepoOrder } from "./repoOrder";

export type AppSettings = {
  watchedRepos: WatchedRepo[];
  repoOrder: string[];
  dismissedPullRequests: string[];
};

export const defaultAppSettings: AppSettings = {
  watchedRepos: [],
  repoOrder: [],
  dismissedPullRequests: [],
};

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!isSettingsRecord(value)) {
    return defaultAppSettings;
  }

  return {
    watchedRepos: normalizeWatchedRepos(value.watchedRepos),
    repoOrder: normalizeRepoOrder(value.repoOrder),
    dismissedPullRequests: normalizeDismissedPullRequests(value.dismissedPullRequests),
  };
}

function normalizeDismissedPullRequests(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter(
    (item): item is string => typeof item === "string" && /^[^/]+\/[^#]+#[1-9]\d*$/.test(item),
  ).map((item) => item.toLowerCase()))];
}

function isSettingsRecord(value: unknown): value is Partial<AppSettings> & Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
