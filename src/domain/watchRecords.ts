import { canonicalWatchId } from "./identity";
import type { WatchTarget } from "./githubUrl";
import { getWatchId, type WatchRecord } from "./watches";

export function decodeWatchRecords(value: unknown): WatchRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const watches = new Map<string, WatchRecord>();
  for (const item of value) {
    const watch = decodeWatchRecord(item);
    if (watch && !watches.has(watch.id)) {
      watches.set(watch.id, watch);
    }
  }
  return [...watches.values()];
}

function decodeWatchRecord(value: unknown): WatchRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const target = decodeTarget(value.target);
  if (!target || typeof value.id !== "string" || canonicalWatchId(value.id) !== getWatchId(target) || typeof value.label !== "string"
    || typeof value.status !== "string" || typeof value.active !== "boolean") {
    return undefined;
  }
  const watch: WatchRecord = {
    id: getWatchId(target), target, label: value.label, status: value.status,
    active: value.active, error: typeof value.error === "string" ? value.error : undefined,
    lastState: undefined,
  };
  for (const key of ["lastSeenStatus", "repoIconUrl"] as const) {
    if (typeof value[key] === "string") watch[key] = value[key];
  }
  for (const key of ["doneAt", "errorAt"] as const) {
    if (isTimestamp(value[key])) watch[key] = value[key];
  }
  if (value.errorKind === "transient") watch.errorKind = value.errorKind;
  if (value.triageState === "inbox" || value.triageState === "saved" || value.triageState === "done") {
    watch.triageState = value.triageState;
  } else if (value.triageState !== undefined) {
    return undefined;
  }
  if (typeof value.sourceState === "string" && ["draft", "ready", "merged", "closed"].includes(value.sourceState)) {
    watch.sourceState = value.sourceState as WatchRecord["sourceState"];
  }
  const source = decodeTarget(value.source);
  const sourceRun = decodeTarget(value.sourceRun);
  if (source?.kind === "pr") watch.source = source;
  if (sourceRun?.kind === "run") watch.sourceRun = sourceRun;
  for (const key of ["ignoredTargetIds", "ignoredWorkflowNames"] as const) {
    if (Array.isArray(value[key])) {
      watch[key] = value[key].filter((item): item is string => typeof item === "string")
        .map((item) => key === "ignoredTargetIds" ? canonicalWatchId(item) : item);
    }
  }
  if (isRecord(value.lastState) && typeof value.lastState.status === "string"
    && (value.lastState.conclusion === null || typeof value.lastState.conclusion === "string")) {
    watch.lastState = {
      status: value.lastState.status,
      conclusion: value.lastState.conclusion,
      ...(typeof value.lastState.hasFailedChildren === "boolean"
        ? { hasFailedChildren: value.lastState.hasFailedChildren } : {}),
    };
  }
  if (isRecord(value.metadata)) {
    watch.metadata = {};
    for (const key of ["prTitle", "prUpdatedAt", "workflowName", "runTitle", "runNumber", "jobName", "branchName", "commitSha"] as const) {
      if (typeof value.metadata[key] === "string") watch.metadata[key] = value.metadata[key];
    }
  }
  if (isRecord(value.timing)) {
    watch.timing = {};
    for (const key of ["queuedAt", "startedAt", "completedAt"] as const) {
      if (isTimestamp(value.timing[key])) watch.timing[key] = value.timing[key];
    }
  }
  return watch;
}

function decodeTarget(value: unknown): WatchTarget | undefined {
  if (!isRecord(value) || typeof value.owner !== "string" || typeof value.repo !== "string"
    || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(value.owner)
    || !/^[A-Za-z0-9._-]+$/.test(value.repo) || typeof value.url !== "string") {
    return undefined;
  }
  try {
    const url = new URL(value.url);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password) return undefined;
  } catch {
    return undefined;
  }
  const base = { owner: value.owner, repo: value.repo, url: value.url };
  const prNumber = isId(value.prNumber) ? { prNumber: value.prNumber } : {};
  if (value.kind === "pr" && isId(value.prNumber)) return { ...base, kind: "pr", prNumber: value.prNumber };
  if (value.kind === "run" && isId(value.runId)) return { ...base, kind: "run", runId: value.runId, ...prNumber };
  if (value.kind === "job" && isId(value.jobId)) {
    return { ...base, kind: "job", jobId: value.jobId, ...prNumber,
      ...(isId(value.runId) ? { runId: value.runId } : {}) };
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
