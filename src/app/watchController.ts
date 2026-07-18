import type { FavoriteRepo } from "../domain/favorites";
import type { CheckWatchTarget, ParsedWatchTarget, PrWatchTarget, WatchTarget } from "../domain/githubUrl";
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
  fetchState(target: WatchTarget): Promise<WatchSnapshot>;
  fetchActiveWorkflowRuns?(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<ActiveWorkflowRun[]>;
  fetchOpenPullRequests?(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<OpenPullRequest[]>;
  fetchRepositoryIconUrl?(target: Pick<ParsedWatchTarget, "owner" | "repo">): Promise<string | undefined>;
  notificationsPaused?(): boolean;
  notify(notification: WatchNotification): Promise<void>;
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

  async function loadBaselineState(id: string, target: WatchTarget): Promise<void> {
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

  async function addWatchTarget(target: WatchTarget, sourceState?: WatchRecord["sourceState"]): Promise<void> {
    const previous = watches;
    const next = addWatch(watches, target, undefined, sourceState);

    if (next === previous) {
      return;
    }

    setWatches(next);

    const id = getWatchId(target);
    void refreshRepositoryIcon(id, target);
    await loadBaselineState(id, target);
  }

  async function addPrWatch(source: PrWatchTarget): Promise<void> {
    await addWatchTarget(source, "ready");
  }

  return {
    async add(target) {
      if (target.kind === "pr") {
        await addPrWatch(target);
        return;
      }

      if (target.kind === "run") {
        await addWatchTarget(target);
        return;
      }

      await addWatchTarget(target);
    },

    remove(id) {
      setWatches(removeWatch(watches, id));
    },

    ignorePrWorkflow(id) {
      setWatches(removeWatch(watches, id));
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

      if (!watch || watch.target.kind === "pr" || !deps.rerunFailed) {
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
      const activeWatches = watches.filter((watch) => watch.active);
      const notificationTime = deps.now?.() ?? new Date();
      const rowNotifications: WatchNotification[] = [];

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

        rowNotifications.push(createWatchNotification(changedWatch, notificationTime));
      }

      if (deps.notificationsPaused?.()) {
        return;
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

function withSnapshotPrNumber(target: WatchTarget, prNumber: string | undefined): WatchTarget {
  if (!prNumber || target.kind === "pr" || target.prNumber === prNumber) {
    return target;
  }

  return {
    ...target,
    prNumber,
  };
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
