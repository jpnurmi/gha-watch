import { defaultAppSettings, normalizeAppSettings, type AppSettings } from "../domain/settings";
import {
  normalizeWatchSuppressions,
  type WatchSuppression,
} from "../domain/watchSuppressions";
import type { WatchRecord } from "../domain/watches";
import {
  emptyWorkflowDiscoveryState,
  normalizeWorkflowDiscoveryState,
  type WorkflowDiscoveryState,
} from "../domain/workflowDiscovery";

const watchesStorageKey = "gha-watch:watches";
const watchSuppressionsStorageKey = "gha-watch:watch-suppressions";
const settingsStorageKey = "gha-watch:settings";
const workflowDiscoveryStorageKey = "gha-watch:workflow-discovery";

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

export function loadWorkflowDiscoveryState(now = new Date()): WorkflowDiscoveryState {
  const rawState = localStorage.getItem(workflowDiscoveryStorageKey);

  if (!rawState) {
    return emptyWorkflowDiscoveryState;
  }

  try {
    return normalizeWorkflowDiscoveryState(JSON.parse(rawState), now);
  } catch {
    return emptyWorkflowDiscoveryState;
  }
}

export async function saveWorkflowDiscoveryState(state: WorkflowDiscoveryState): Promise<void> {
  localStorage.setItem(workflowDiscoveryStorageKey, JSON.stringify(state));
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
