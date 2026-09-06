import { decodeStoredWatches, encodeStoredWatches } from "../domain/watchDocument";
import { decodeWatchRecords } from "../domain/watchRecords";
import { defaultAppSettings, normalizeAppSettings, type AppSettings } from "../domain/settings";
import {
  normalizeWatchSuppressions,
  type WatchSuppression,
} from "../domain/watchSuppressions";
import type { WatchRecord } from "../domain/watches";
import {
  normalizeWorkflowDiscoveryState,
  type WorkflowDiscoveryState,
} from "../domain/workflowDiscovery";

const watchesStorageKey = "gha-watch:watches";
const watchSuppressionsStorageKey = "gha-watch:watch-suppressions";
const settingsStorageKey = "gha-watch:settings";
const workflowDiscoveryStorageKey = "gha-watch:workflow-discovery";

const stateStorageKey = "gha-watch:state";

type LocalState = {
  watches: WatchRecord[];
  suppressions: WatchSuppression[];
  discovery: WorkflowDiscoveryState;
};

function readJson(key: string): unknown {
  const raw = localStorage.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`Could not read stored state: ${key}`);
    return undefined;
  }
}

function loadState(now = new Date()): LocalState {
  const stored = readJson(stateStorageKey);
  if (stored && typeof stored === "object") {
    const document = stored as Record<string, unknown>;
    if (document.version !== 1) throw new Error("Unsupported local state version.");
    return {
      watches: decodeStoredWatches(document.watches),
      suppressions: normalizeWatchSuppressions(document.suppressions),
      discovery: normalizeWorkflowDiscoveryState(document.discovery, now),
    };
  }
  return {
    watches: decodeWatchRecords(readJson(watchesStorageKey)),
    suppressions: normalizeWatchSuppressions(readJson(watchSuppressionsStorageKey)),
    discovery: normalizeWorkflowDiscoveryState(readJson(workflowDiscoveryStorageKey), now),
  };
}

function saveState(state: LocalState): void {
  localStorage.setItem(stateStorageKey, JSON.stringify({
    version: 1,
    watches: encodeStoredWatches(state.watches),
    suppressions: state.suppressions,
    discovery: state.discovery,
  }));
}

export function loadWatches(): WatchRecord[] {
  return loadState().watches;
}

export async function saveWatches(watches: WatchRecord[]): Promise<void> {
  saveState({ ...loadState(), watches });
}

export function loadWatchSuppressions(): WatchSuppression[] {
  return loadState().suppressions;
}

export async function saveWatchSuppressions(suppressions: WatchSuppression[]): Promise<void> {
  saveState({ ...loadState(), suppressions });
}

export function loadWorkflowDiscoveryState(now = new Date()): WorkflowDiscoveryState {
  return loadState(now).discovery;
}

export async function saveWorkflowDiscoveryState(discovery: WorkflowDiscoveryState): Promise<void> {
  saveState({ ...loadState(), discovery });
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
