export type AppSettings = {
  autoClearMergedPrWatches: boolean;
};

export const defaultAppSettings: AppSettings = {
  autoClearMergedPrWatches: false,
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
  };
}

function isSettingsRecord(value: unknown): value is Partial<AppSettings> {
  return typeof value === "object" && value !== null;
}
