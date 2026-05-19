import type { FavoriteRepo } from "../domain/favorites";
import type { CheckWatchTarget, ParsedWatchTarget, PrWatchTarget, RunWatchTarget } from "../domain/githubUrl";
import { formatWatchState, getStatusTransition, isTerminalStatus } from "../domain/status";
import {
  addWatch,
  getWatchId,
  markAllWatchesSeen,
  markWatchSeen,
  moveWatchGroupWithinRepo,
  moveWatchWithinRepo,
  normalizeWatchSeenStatus,
  removeWatch,
  type PrWatchResolution,
  type RunWatchResolution,
  type WatchDropPosition,
  type WatchRecord,
} from "../domain/watches";
import type { WatchSnapshot } from "../platform/gh";
import type { ActiveWorkflowRun, OpenPullRequest } from "../platform/gh";
import {
  createPullRequestNotification,
  createWatchNotification,
  getPullRequestNotificationId,
  type WatchNotification,
} from "./watchNotification";

export type WatchControllerOptions = {
  autoClearMergedPrWatches?: boolean;
};

export type WatchControllerDeps = {
  fetchState(target: CheckWatchTarget): Promise<WatchSnapshot>;
  fetchActiveWorkflowRuns?(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<ActiveWorkflowRun[]>;
  fetchOpenPullRequests?(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<OpenPullRequest[]>;
  fetchRepositoryIconUrl?(target: Pick<ParsedWatchTarget, "owner" | "repo">): Promise<string | undefined>;
  notificationsPaused?(): boolean;
  notify(notification: WatchNotification): Promise<void>;
  resolvePrWatchTargets?(target: PrWatchTarget): Promise<PrWatchResolution>;
  resolveRunWatchTargets?(target: RunWatchTarget): Promise<RunWatchResolution>;
  rerunFailed?(target: CheckWatchTarget): Promise<void>;
  now?(): Date;
  save(watches: WatchRecord[]): Promise<void>;
};

export type WatchController = {
  add(target: ParsedWatchTarget): Promise<void>;
  remove(id: string): void;
  ignorePrWorkflow(id: string): void;
  reorderGroupWithinRepo(draggedIds: string[], targetIds: string[], position: WatchDropPosition): void;
  reorderWithinRepo(draggedId: string, targetId: string, position: WatchDropPosition): void;
  markSeen(id: string): void;
  markAllSeen(): void;
  clearAll(): void;
  clearFinished(): void;
  refreshRepositoryIcons(): Promise<void>;
  refreshWatchMetadata(): Promise<void>;
  listActiveWorkflowRuns(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<ActiveWorkflowRun[]>;
  listOpenPullRequests(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<OpenPullRequest[]>;
  rerunFailed(id: string): Promise<void>;
  setOptions(options: WatchControllerOptions): void;
  pollNow(): Promise<void>;
  getWatches(): WatchRecord[];
  subscribe(listener: () => void): () => void;
};

export function createWatchController(
  deps: WatchControllerDeps,
  initialWatches: WatchRecord[] = [],
  initialOptions: WatchControllerOptions = {},
): WatchController {
  let watches: WatchRecord[] = initialWatches.map(normalizeWatchSeenStatus);
  let options: WatchControllerOptions = initialOptions;
  const listeners = new Set<() => void>();

  function emitChange(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function setWatches(nextWatches: WatchRecord[]): void {
    watches = nextWatches;
    void deps.save(watches);
    emitChange();
  }

  function updateWatch(id: string, update: (watch: WatchRecord) => WatchRecord): void {
    setWatches(watches.map((watch) => (watch.id === id ? update(watch) : watch)));
  }

  async function refreshRepositoryIcon(id: string, target: ParsedWatchTarget): Promise<void> {
    if (!deps.fetchRepositoryIconUrl) {
      return;
    }

    const current = watches.find((watch) => watch.id === id);

    if (!current || current.repoIconUrl) {
      return;
    }

    try {
      const repoIconUrl = await deps.fetchRepositoryIconUrl(target);

      if (repoIconUrl) {
        updateWatch(id, (watch) => ({ ...watch, repoIconUrl }));
      }
    } catch {
      // Missing avatars should not interfere with status watching.
    }
  }

  async function loadBaselineState(id: string, target: CheckWatchTarget): Promise<void> {
    try {
      const snapshot = await deps.fetchState(target);
      const status = formatWatchState(snapshot);
      updateWatch(id, (watch) => ({
        ...watch,
        target: withSnapshotPrNumber(watch.target, snapshot.prNumber),
        label: snapshot.title,
        metadata: mergeWatchMetadata(watch.metadata, snapshot.metadata),
        status,
        lastSeenStatus: status,
        lastState: {
          status: snapshot.status,
          conclusion: snapshot.conclusion,
        },
        timing: snapshot.timing,
        active: !isTerminalStatus(snapshot),
        error: undefined,
      }));
    } catch (error) {
      updateWatch(id, (watch) => ({
        ...watch,
        status: "error",
        lastSeenStatus: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function addCheckWatch(
    target: CheckWatchTarget,
    source?: PrWatchTarget,
    sourceState?: PrWatchResolution["sourceState"],
    metadata?: WatchRecord["metadata"],
    ignoredWorkflowNames?: string[],
    ignoredTargetIds?: string[],
    sourceRun?: RunWatchTarget,
  ): Promise<void> {
    const previous = watches;
    const next = addWatch(
      watches,
      target,
      source,
      sourceState,
      metadata,
      ignoredWorkflowNames,
      ignoredTargetIds,
      sourceRun,
    );

    if (next === previous) {
      return;
    }

    setWatches(next);

    const id = getWatchId(target);
    void refreshRepositoryIcon(id, target);
    await loadBaselineState(id, target);
  }

  function reconcileRunWatchTargets(sourceRun: RunWatchTarget, resolution: RunWatchResolution): void {
    const parent = watches.find((watch) => isDirectRunWatch(watch, sourceRun));

    if (!parent) {
      return;
    }

    const ignoredTargetIds = parent.ignoredTargetIds ?? [];
    const visibleTargets = resolution.targets.filter((target) => !ignoredTargetIds.includes(getWatchId(target)));
    const targetIds = new Set(visibleTargets.map(getWatchId));
    let next = watches.filter((watch) => !isSameRunSource(watch.sourceRun, sourceRun) || targetIds.has(watch.id));

    for (const target of visibleTargets) {
      const id = getWatchId(target);
      const existing = next.find((watch) => watch.id === id);
      const metadata = getResolutionTargetMetadata(resolution, target);

      if (existing) {
        next = next.map((watch) =>
          watch.id === id
            ? {
                ...watch,
                target,
                sourceRun,
                ...(metadata ? { metadata: mergeWatchMetadata(watch.metadata, metadata) } : {}),
              }
            : watch,
        );
      } else {
        next = addWatch(next, target, undefined, undefined, metadata, undefined, undefined, sourceRun);
      }
    }

    setWatches(next);
  }

  async function getRunWatchResolution(sourceRun: RunWatchTarget): Promise<RunWatchResolution> {
    if (!deps.resolveRunWatchTargets) {
      return { targets: [] };
    }

    return deps.resolveRunWatchTargets(sourceRun);
  }

  async function addRunWatch(target: RunWatchTarget): Promise<void> {
    const previousIds = new Set(watches.map((watch) => watch.id));

    await addCheckWatch(target);

    if (previousIds.has(getWatchId(target))) {
      return;
    }

    try {
      const resolution = await getRunWatchResolution(target);

      reconcileRunWatchTargets(target, resolution);

      for (const jobTarget of resolution.targets) {
        if (!watches.some((watch) => watch.id === getWatchId(jobTarget))) {
          continue;
        }

        await loadBaselineState(getWatchId(jobTarget), jobTarget);
      }
    } catch {
      // The workflow itself is still a valid watch even if job expansion fails.
    }
  }

  function reconcilePrWatchTargets(source: PrWatchTarget, resolution: PrWatchResolution): void {
    const { targets, sourceState } = resolution;

    if (targets.length === 0) {
      updatePrSourceState(source, sourceState);
      return;
    }

    const ignoredWorkflowNames = getIgnoredWorkflowNames(watches, source);
    const ignoredTargetIds = getIgnoredTargetIds(watches, source);
    const visibleTargets = targets.filter((target) => {
      if (ignoredTargetIds.includes(getWatchId(target))) {
        return false;
      }

      const metadata = getResolutionTargetMetadata(resolution, target);
      const workflowName = getWorkflowNameFromMetadata(metadata);
      return !workflowName || !ignoredWorkflowNames.includes(workflowName);
    });
    const targetIds = new Set(visibleTargets.map(getWatchId));
    let next = watches.filter((watch) => !isSamePrSource(watch.source, source) || targetIds.has(watch.id));

    for (const target of visibleTargets) {
      const id = getWatchId(target);
      const existing = next.find((watch) => watch.id === id);
      const metadata = getResolutionTargetMetadata(resolution, target);

      if (existing) {
        next = next.map((watch) =>
          watch.id === id
            ? withIgnoredPrExclusions(
                { ...watch, target, source, sourceState, ...(metadata ? { metadata } : {}) },
                ignoredWorkflowNames,
                ignoredTargetIds,
              )
            : watch,
        );
      } else {
        next = addWatch(next, target, source, sourceState, metadata, ignoredWorkflowNames, ignoredTargetIds);
      }
    }

    setWatches(next);
  }

  function updatePrSourceState(source: PrWatchTarget, sourceState: PrWatchResolution["sourceState"]): void {
    let changed = false;
    const next = watches.map((watch) => {
      if (!isSamePrSource(watch.source, source) || watch.sourceState === sourceState) {
        return watch;
      }

      changed = true;
      return { ...watch, sourceState };
    });

    if (changed) {
      setWatches(next);
    }
  }

  async function getPrWatchResolution(source: PrWatchTarget): Promise<PrWatchResolution> {
    if (!deps.resolvePrWatchTargets) {
      throw new Error("Live PR watches need GitHub PR resolution support.");
    }

    return deps.resolvePrWatchTargets(source);
  }

  function assertPrWatchHasTargets(resolution: PrWatchResolution): void {
    if (resolution.sourceState === "merged") {
      throw new Error("This pull request has already been merged.");
    }

    if (resolution.targets.length === 0) {
      throw new Error("No workflow runs were found for this pull request.");
    }
  }

  async function addPrWatch(source: PrWatchTarget): Promise<void> {
    const resolution = await getPrWatchResolution(source);

    assertPrWatchHasTargets(resolution);
    reconcilePrWatchTargets(source, resolution);

    for (const target of resolution.targets) {
      void refreshRepositoryIcon(getWatchId(target), target);
      await loadBaselineState(getWatchId(target), target);
    }
  }

  async function refreshPrSourceWatches(): Promise<void> {
    for (const source of getPrSources(watches)) {
      try {
        const resolution = await getPrWatchResolution(source);

        if (resolution.sourceState === "merged" && options.autoClearMergedPrWatches) {
          setWatches(watches.filter((watch) => !isSamePrSource(watch.source, source)));
          continue;
        }

        reconcilePrWatchTargets(source, resolution);
      } catch {
        // Existing concrete run watches should keep polling even if PR resolution briefly fails.
      }
    }
  }

  async function refreshRunSourceWatches(): Promise<void> {
    for (const sourceRun of getRunSources(watches)) {
      const parent = watches.find((watch) => isDirectRunWatch(watch, sourceRun));

      if (!parent?.active) {
        continue;
      }

      try {
        reconcileRunWatchTargets(sourceRun, await getRunWatchResolution(sourceRun));
      } catch {
        // Existing concrete run watches should keep polling even if job expansion briefly fails.
      }
    }
  }

  return {
    async add(target) {
      if (target.kind === "pr") {
        await addPrWatch(target);
        return;
      }

      if (target.kind === "run") {
        await addRunWatch(target);
        return;
      }

      await addCheckWatch(target);
    },

    remove(id) {
      const watch = watches.find((item) => item.id === id);

      if (watch?.source) {
        setWatches(watches.filter((item) => !isSamePrSource(item.source, watch.source!)));
        return;
      }

      if (watch?.sourceRun) {
        const sourceRun = watch.sourceRun;
        const ignoredTargetIds = addIgnoredTargetIds(getIgnoredRunTargetIds(watches, sourceRun), [watch.id]);
        const next = watches.flatMap((item) => {
          if (item.id === id) {
            return [];
          }

          return isDirectRunWatch(item, sourceRun) ? [withIgnoredTargetIds(item, ignoredTargetIds)] : [item];
        });

        setWatches(next);
        return;
      }

      if (watch?.target.kind === "run" && isDirectRunWatch(watch, watch.target)) {
        const sourceRun = watch.target;

        setWatches(watches.filter((item) => item.id !== id && !isSameRunSource(item.sourceRun, sourceRun)));
        return;
      }

      setWatches(removeWatch(watches, id));
    },

    ignorePrWorkflow(id) {
      const watch = watches.find((item) => item.id === id);

      if (!watch?.source) {
        return;
      }

      const workflowName = getWatchWorkflowName(watch);

      if (!workflowName) {
        return;
      }

      const ignoredWorkflowNames = addIgnoredWorkflowName(getIgnoredWorkflowNames(watches, watch.source), workflowName);
      const ignoredTargetIds = addIgnoredTargetIds(
        getIgnoredTargetIds(watches, watch.source),
        watches
          .filter((item) => isSamePrSource(item.source, watch.source!) && getWatchWorkflowName(item) === workflowName)
          .map((item) => item.id),
      );
      const next = watches.flatMap((item) => {
        if (!isSamePrSource(item.source, watch.source!)) {
          return [item];
        }

        return getWatchWorkflowName(item) === workflowName
          ? []
          : [withIgnoredPrExclusions(item, ignoredWorkflowNames, ignoredTargetIds)];
      });

      setWatches(next);
    },

    reorderGroupWithinRepo(draggedIds, targetIds, position) {
      const next = moveWatchGroupWithinRepo(watches, draggedIds, targetIds, position);

      if (next !== watches) {
        setWatches(next);
      }
    },

    reorderWithinRepo(draggedId, targetId, position) {
      const next = moveWatchWithinRepo(watches, draggedId, targetId, position);

      if (next !== watches) {
        setWatches(next);
      }
    },

    markSeen(id) {
      const prSource = getPrSourceByNotificationId(watches, id);

      if (prSource) {
        setWatches(
          watches.map((watch) => (isSamePrSource(watch.source, prSource) ? markWatchSeenStatus(watch) : watch)),
        );
        return;
      }

      setWatches(markWatchSeen(watches, id));
    },

    markAllSeen() {
      setWatches(markAllWatchesSeen(watches));
    },

    clearAll() {
      setWatches([]);
    },

    clearFinished() {
      setWatches(watches.filter((watch) => watch.active));
    },

    async refreshRepositoryIcons() {
      await Promise.all(watches.map((watch) => refreshRepositoryIcon(watch.id, watch.target)));
    },

    async refreshWatchMetadata() {
      const watchesMissingMetadata = watches.filter((watch) => !watch.target.prNumber);

      for (const watch of watchesMissingMetadata) {
        try {
          const snapshot = await deps.fetchState(watch.target);
          const nextState = {
            status: snapshot.status,
            conclusion: snapshot.conclusion,
          };
          const status = formatWatchState(nextState);

          updateWatch(watch.id, (current) => ({
            ...current,
            target: withSnapshotPrNumber(current.target, snapshot.prNumber),
            label: snapshot.title,
            metadata: mergeWatchMetadata(current.metadata, snapshot.metadata),
            status,
            lastSeenStatus: current.lastSeenStatus ?? current.status,
            lastState: nextState,
            timing: snapshot.timing,
            active: !isTerminalStatus(nextState),
            error: undefined,
          }));
        } catch {
          // Metadata refresh should not turn existing watches into error rows.
        }
      }
    },

    async listActiveWorkflowRuns(target) {
      if (!deps.fetchActiveWorkflowRuns) {
        throw new Error("Active workflow run lists need GitHub run listing support.");
      }

      return deps.fetchActiveWorkflowRuns(target);
    },

    async listOpenPullRequests(target) {
      if (!deps.fetchOpenPullRequests) {
        throw new Error("Open pull request lists need GitHub PR listing support.");
      }

      return deps.fetchOpenPullRequests(target);
    },

    async rerunFailed(id) {
      const watch = watches.find((item) => item.id === id);

      if (!watch || !deps.rerunFailed) {
        return;
      }

      await deps.rerunFailed(watch.target);
      updateWatch(id, (current) => ({
        ...current,
        active: true,
        error: undefined,
      }));
    },

    setOptions(nextOptions) {
      options = { ...options, ...nextOptions };
    },

    async pollNow() {
      await refreshPrSourceWatches();
      await refreshRunSourceWatches();
      const activeWatches = watches.filter((watch) => watch.active);
      const rowNotifications: WatchNotification[] = [];
      const changedPrSources = new Map<string, PrWatchTarget>();

      for (const watch of activeWatches) {
        const snapshot = await deps.fetchState(watch.target);
        const nextState = {
          status: snapshot.status,
          conclusion: snapshot.conclusion,
        };
        const status = formatWatchState(nextState);
        const transition = getStatusTransition(watch.lastState, nextState);
        let changedWatch: WatchRecord | undefined;

        updateWatch(watch.id, (current) => {
          const nextWatch = {
            ...current,
            target: withSnapshotPrNumber(current.target, snapshot.prNumber),
            label: snapshot.title,
            metadata: mergeWatchMetadata(current.metadata, snapshot.metadata),
            status,
            lastSeenStatus: current.lastSeenStatus ?? current.status,
            lastState: nextState,
            timing: snapshot.timing,
            active: !isTerminalStatus(nextState),
            error: undefined,
          };

          if (transition.notify) {
            changedWatch = nextWatch;
          }

          return nextWatch;
        });

        if (!transition.notify || !changedWatch) {
          continue;
        }

        if (watch.source) {
          changedPrSources.set(getPullRequestNotificationId(watch.source), watch.source);
          continue;
        }

        if (!watch.sourceRun) {
          rowNotifications.push(createWatchNotification(changedWatch, watch.lastState, deps.now?.() ?? new Date()));
        }
      }

      if (deps.notificationsPaused?.()) {
        return;
      }

      for (const source of changedPrSources.values()) {
        const notification = createPullRequestNotification(
          source,
          watches.filter((watch) => isSamePrSource(watch.source, source)),
          deps.now?.() ?? new Date(),
        );

        if (notification) {
          await deps.notify(notification);
        }
      }

      for (const notification of rowNotifications) {
        await deps.notify(notification);
      }
    },

    getWatches() {
      return watches;
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function withSnapshotPrNumber(target: CheckWatchTarget, prNumber: string | undefined): CheckWatchTarget {
  if (!prNumber || target.prNumber === prNumber) {
    return target;
  }

  return {
    ...target,
    prNumber,
  };
}

function getResolutionTargetMetadata(
  resolution: Pick<PrWatchResolution | RunWatchResolution, "targetMetadata">,
  target: CheckWatchTarget,
): WatchRecord["metadata"] | undefined {
  return resolution.targetMetadata?.[getWatchId(target)];
}

function getIgnoredWorkflowNames(watches: WatchRecord[], source: PrWatchTarget): string[] {
  for (const watch of watchesForSource(watches, source)) {
    if (watch.ignoredWorkflowNames?.length) {
      return watch.ignoredWorkflowNames;
    }
  }

  return [];
}

function getIgnoredTargetIds(watches: WatchRecord[], source: PrWatchTarget): string[] {
  for (const watch of watchesForSource(watches, source)) {
    if (watch.ignoredTargetIds?.length) {
      return watch.ignoredTargetIds;
    }
  }

  return [];
}

function getIgnoredRunTargetIds(watches: WatchRecord[], sourceRun: RunWatchTarget): string[] {
  return watches.find((watch) => isDirectRunWatch(watch, sourceRun))?.ignoredTargetIds ?? [];
}

function watchesForSource(watches: WatchRecord[], source: PrWatchTarget): WatchRecord[] {
  return watches.filter((watch) => isSamePrSource(watch.source, source));
}

function getWatchWorkflowName(watch: WatchRecord): string | undefined {
  const metadataName = getWorkflowNameFromMetadata(watch.metadata);

  if (metadataName) {
    return metadataName;
  }

  const separatorIndex = watch.label.indexOf(": ");

  return (separatorIndex > 0 ? watch.label.slice(0, separatorIndex) : watch.label).trim() || undefined;
}

function getWorkflowNameFromMetadata(metadata: WatchRecord["metadata"]): string | undefined {
  return metadata?.workflowName?.trim() || undefined;
}

function mergeWatchMetadata(
  current: WatchRecord["metadata"],
  snapshot: WatchRecord["metadata"],
): WatchRecord["metadata"] {
  const metadata = {
    ...(current ?? {}),
    ...(snapshot ?? {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function addIgnoredWorkflowName(ignoredWorkflowNames: string[], workflowName: string): string[] {
  return ignoredWorkflowNames.includes(workflowName)
    ? ignoredWorkflowNames
    : [...ignoredWorkflowNames, workflowName];
}

function addIgnoredTargetIds(ignoredTargetIds: string[], targetIds: string[]): string[] {
  const next = [...ignoredTargetIds];

  for (const targetId of targetIds) {
    if (!next.includes(targetId)) {
      next.push(targetId);
    }
  }

  return next;
}

function withIgnoredPrExclusions(
  watch: WatchRecord,
  ignoredWorkflowNames: string[],
  ignoredTargetIds: string[],
): WatchRecord {
  const {
    ignoredWorkflowNames: _ignoredWorkflowNames,
    ignoredTargetIds: _ignoredTargetIds,
    ...baseWatch
  } = watch;

  return {
    ...baseWatch,
    ...(ignoredTargetIds.length ? { ignoredTargetIds } : {}),
    ...(ignoredWorkflowNames.length ? { ignoredWorkflowNames } : {}),
  };
}

function withIgnoredTargetIds(watch: WatchRecord, ignoredTargetIds: string[]): WatchRecord {
  const { ignoredTargetIds: _ignoredTargetIds, ...baseWatch } = watch;

  return {
    ...baseWatch,
    ...(ignoredTargetIds.length ? { ignoredTargetIds } : {}),
  };
}

function markWatchSeenStatus(watch: WatchRecord): WatchRecord {
  return {
    ...watch,
    lastSeenStatus: watch.status,
  };
}

function getPrSourceByNotificationId(watches: WatchRecord[], id: string): PrWatchTarget | undefined {
  return watches.find((watch) => watch.source && getPullRequestNotificationId(watch.source) === id)?.source;
}

function getPrSources(watches: WatchRecord[]): PrWatchTarget[] {
  const sources = new Map<string, PrWatchTarget>();

  for (const watch of watches) {
    if (watch.source) {
      sources.set(getPrSourceKey(watch.source), watch.source);
    }
  }

  return Array.from(sources.values());
}

function getRunSources(watches: WatchRecord[]): RunWatchTarget[] {
  const sources = new Map<string, RunWatchTarget>();

  for (const watch of watches) {
    if (isDirectRunWatch(watch)) {
      sources.set(getRunSourceKey(watch.target), watch.target);
    }
  }

  return Array.from(sources.values());
}

function isDirectRunWatch(watch: WatchRecord, sourceRun?: RunWatchTarget): watch is WatchRecord & { target: RunWatchTarget } {
  if (watch.target.kind !== "run" || watch.source || watch.sourceRun) {
    return false;
  }

  return sourceRun ? getRunSourceKey(watch.target) === getRunSourceKey(sourceRun) : true;
}

function isSamePrSource(left: PrWatchTarget | undefined, right: PrWatchTarget): boolean {
  return Boolean(left && getPrSourceKey(left) === getPrSourceKey(right));
}

function getPrSourceKey(source: PrWatchTarget): string {
  return `${source.owner}/${source.repo}/pull/${source.prNumber}`;
}

function isSameRunSource(left: RunWatchTarget | undefined, right: RunWatchTarget): boolean {
  return Boolean(left && getRunSourceKey(left) === getRunSourceKey(right));
}

function getRunSourceKey(source: RunWatchTarget): string {
  return `${source.owner}/${source.repo}/run/${source.runId}`;
}
