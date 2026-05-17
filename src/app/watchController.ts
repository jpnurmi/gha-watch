import type { FavoriteRepo } from "../domain/favorites";
import type { CheckWatchTarget, ParsedWatchTarget, PrWatchTarget } from "../domain/githubUrl";
import { formatWatchState, getStatusTransition, isTerminalStatus } from "../domain/status";
import {
  addWatch,
  getWatchId,
  markAllWatchesSeen,
  markWatchSeen,
  moveWatchWithinRepo,
  normalizeWatchSeenStatus,
  removeWatch,
  type PrWatchResolution,
  type WatchDropPosition,
  type WatchRecord,
} from "../domain/watches";
import type { WatchSnapshot } from "../platform/gh";
import type { ActiveWorkflowRun, OpenPullRequest } from "../platform/gh";
import { createWatchNotification, type WatchNotification } from "./watchNotification";

export type WatchControllerOptions = {
  autoClearMergedPrWatches?: boolean;
};

export type WatchControllerDeps = {
  fetchState(target: CheckWatchTarget): Promise<WatchSnapshot>;
  fetchActiveWorkflowRuns?(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<ActiveWorkflowRun[]>;
  fetchOpenPullRequests?(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<OpenPullRequest[]>;
  fetchRepositoryIconUrl?(target: Pick<ParsedWatchTarget, "owner" | "repo">): Promise<string | undefined>;
  notify(notification: WatchNotification): Promise<void>;
  resolvePrWatchTargets?(target: PrWatchTarget): Promise<PrWatchResolution>;
  rerunFailed?(target: CheckWatchTarget): Promise<void>;
  now?(): Date;
  save(watches: WatchRecord[]): Promise<void>;
};

export type WatchController = {
  add(target: ParsedWatchTarget): Promise<void>;
  remove(id: string): void;
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
  ): Promise<void> {
    const previous = watches;
    const next = addWatch(watches, target, source, sourceState);

    if (next === previous) {
      return;
    }

    setWatches(next);

    const id = getWatchId(target);
    void refreshRepositoryIcon(id, target);
    await loadBaselineState(id, target);
  }

  function reconcilePrWatchTargets(source: PrWatchTarget, resolution: PrWatchResolution): void {
    const { targets, sourceState } = resolution;

    if (targets.length === 0) {
      updatePrSourceState(source, sourceState);
      return;
    }

    const targetIds = new Set(targets.map(getWatchId));
    let next = watches.filter((watch) => !isSamePrSource(watch.source, source) || targetIds.has(watch.id));

    for (const target of targets) {
      const id = getWatchId(target);
      const existing = next.find((watch) => watch.id === id);

      if (existing) {
        next = next.map((watch) => (watch.id === id ? { ...watch, target, source, sourceState } : watch));
      } else {
        next = addWatch(next, target, source, sourceState);
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

  return {
    async add(target) {
      if (target.kind === "pr") {
        await addPrWatch(target);
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

      setWatches(removeWatch(watches, id));
    },

    reorderWithinRepo(draggedId, targetId, position) {
      const next = moveWatchWithinRepo(watches, draggedId, targetId, position);

      if (next !== watches) {
        setWatches(next);
      }
    },

    markSeen(id) {
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
      const activeWatches = watches.filter((watch) => watch.active);

      for (const watch of activeWatches) {
        const snapshot = await deps.fetchState(watch.target);
        const nextState = {
          status: snapshot.status,
          conclusion: snapshot.conclusion,
        };
        const status = formatWatchState(nextState);
        const transition = getStatusTransition(watch.lastState, nextState);
        let notification: WatchNotification | undefined;

        updateWatch(watch.id, (current) => {
          const nextWatch = {
            ...current,
            target: withSnapshotPrNumber(current.target, snapshot.prNumber),
            label: snapshot.title,
            status,
            lastSeenStatus: current.lastSeenStatus ?? current.status,
            lastState: nextState,
            timing: snapshot.timing,
            active: !isTerminalStatus(nextState),
            error: undefined,
          };

          if (transition.notify) {
            notification = createWatchNotification(nextWatch, watch.lastState, deps.now?.() ?? new Date());
          }

          return nextWatch;
        });

        if (notification) {
          await deps.notify(notification);
        }
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

function getPrSources(watches: WatchRecord[]): PrWatchTarget[] {
  const sources = new Map<string, PrWatchTarget>();

  for (const watch of watches) {
    if (watch.source) {
      sources.set(getPrSourceKey(watch.source), watch.source);
    }
  }

  return Array.from(sources.values());
}

function isSamePrSource(left: PrWatchTarget | undefined, right: PrWatchTarget): boolean {
  return Boolean(left && getPrSourceKey(left) === getPrSourceKey(right));
}

function getPrSourceKey(source: PrWatchTarget): string {
  return `${source.owner}/${source.repo}/pull/${source.prNumber}`;
}
