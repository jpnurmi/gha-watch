import { decodeWatchRecords } from "./watchRecords";
import { formatWatchState } from "./status";
import type { WatchRecord } from "./watches";

export type StoredWatch = {
  identity: Pick<WatchRecord, "id" | "target" | "source" | "sourceRun">;
  intent: Pick<WatchRecord, "triageState" | "doneAt" | "ignoredTargetIds" | "ignoredWorkflowNames">;
  local: Pick<WatchRecord, "lastSeenStatus" | "repoIconUrl" | "error" | "errorKind" | "errorAt">;
  observation: Omit<WatchRecord, keyof StoredWatch["identity"] | keyof StoredWatch["intent"] | keyof StoredWatch["local"] | "status"> & { status?: string };
};

export function encodeStoredWatches(watches: WatchRecord[]): StoredWatch[] {
  return watches.map((watch) => {
    const { id, target, source, sourceRun, triageState, doneAt, ignoredTargetIds, ignoredWorkflowNames,
      lastSeenStatus, repoIconUrl, error, errorKind, errorAt, status, ...observation } = watch;
    return {
      identity: { id, target, source, sourceRun },
      intent: { triageState, doneAt, ignoredTargetIds, ignoredWorkflowNames },
      local: { lastSeenStatus, repoIconUrl, error, errorKind, errorAt },
      observation: { ...observation, ...(!observation.lastState ? { status } : {}) },
    };
  });
}

export function decodeStoredWatches(value: unknown): WatchRecord[] {
  if (!Array.isArray(value)) return [];
  return decodeWatchRecords(value.flatMap((item) => {
    if (!isRecord(item) || !isRecord(item.identity) || !isRecord(item.intent)
      || !isRecord(item.observation) || !isRecord(item.local)) return [];
    const observation = item.observation;
    const state = observation.lastState;
    const status = isRecord(state) && typeof state.status === "string"
      && (state.conclusion === null || typeof state.conclusion === "string")
      ? formatWatchState({ status: state.status, conclusion: state.conclusion,
        hasFailedChildren: state.hasFailedChildren === true })
      : observation.status;
    return [{ ...item.observation, ...item.local, ...item.intent, ...item.identity, status }];
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
