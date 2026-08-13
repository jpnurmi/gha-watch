import { normalizeWatchedRepos, type WatchedRepo } from "./watchedRepos";
import { normalizeRepoOrder } from "./repoOrder";

export type AppSettings = {
  globalAddShortcut: GlobalAddShortcutSettings;
  watchedRepos: WatchedRepo[];
  repoOrder: string[];
};

export type GlobalAddShortcutSettings = {
  accelerator: string;
  enabled: boolean;
};

export const defaultGlobalAddShortcutSettings: GlobalAddShortcutSettings = {
  accelerator: "CommandOrControl+Shift+G",
  enabled: false,
};

export const defaultAppSettings: AppSettings = {
  globalAddShortcut: defaultGlobalAddShortcutSettings,
  watchedRepos: [],
  repoOrder: [],
};

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!isSettingsRecord(value)) {
    return defaultAppSettings;
  }

  return {
    globalAddShortcut: normalizeGlobalAddShortcutSettings(value.globalAddShortcut),
    watchedRepos: normalizeWatchedRepos(value.watchedRepos),
    repoOrder: normalizeRepoOrder(value.repoOrder),
  };
}

function normalizeGlobalAddShortcutSettings(value: unknown): GlobalAddShortcutSettings {
  if (!isSettingsRecord(value)) {
    return defaultGlobalAddShortcutSettings;
  }

  const accelerator = typeof value.accelerator === "string" && value.accelerator.trim().length > 0
    ? value.accelerator.trim().slice(0, 80)
    : defaultGlobalAddShortcutSettings.accelerator;

  return {
    accelerator,
    enabled: value.enabled === true,
  };
}

function isSettingsRecord(value: unknown): value is Partial<AppSettings> & Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
