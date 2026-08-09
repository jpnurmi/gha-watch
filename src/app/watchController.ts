import type { FavoriteRepo } from "../domain/favorites";
import type { CheckWatchTarget, ParsedWatchTarget, PrWatchTarget, WatchTarget } from "../domain/githubUrl";
import { formatWatchState, getStatusTransition, isTerminalStatus } from "../domain/status";
import {
  addWatchSuppressions,
  clearExpiredWatchSuppressions,
  isWatchSuppressed,
  removeWatchSuppression,
  type WatchSuppression,
} from "../domain/watchSuppressions";
import {
  addWatch,
  clearDoneWatches,
  clearExpiredDoneWatches,
  getWatchId,
  getWatchTriageState,
  markAllWatchesSeen,
  markWatchSeen,
  hasUnseenStatusChange,
  moveWatchGroupWithinRepo,
  moveWatchWithinRepo,
  normalizeWatchDoneAt,
  normalizeWatchSeenStatus,
  setWatchesTriageState,
  type WatchDropPosition,
  type WatchRecord,
  type WatchTriageState,
} from "../domain/watches";
import type { WatchSnapshot } from "../platform/gh";
import type {
  ActiveWorkflowRun,
  OpenPullRequest,
  PullRequestDetails,
  WorkflowDefinition,
} from "../platform/gh";
import { createWatchNotification, type WatchNotification } from "./watchNotification";

export type WatchControllerOptions = {
  autoDoneFinishedWatches?: boolean;
};

export type WatchControllerDeps = {
  fetchState(target: WatchTarget): Promise<WatchSnapshot>;
  fetchActiveWorkflowRuns?(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<ActiveWorkflowRun[]>;
  fetchOpenPullRequests?(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<OpenPullRequest[]>;
  fetchPullRequestDetails?(target: PrWatchTarget): Promise<PullRequestDetails>;
  fetchRepositoryDefaultBranch?(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<string>;
  fetchRepositoryIconUrl?(target: Pick<ParsedWatchTarget, "owner" | "repo">): Promise<string | undefined>;
  fetchUserActiveWorkflowRuns?(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<ActiveWorkflowRun[]>;
  fetchWorkflowDefinitions?(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<WorkflowDefinition[]>;
  notificationsPaused?(): boolean;
  notify(notification: WatchNotification): Promise<void>;
  rerunFailed?(target: CheckWatchTarget): Promise<void>;
  now?(): Date;
  save(watches: WatchRecord[]): Promise<void>;
  saveSuppressions(suppressions: WatchSuppression[]): Promise<void>;
};

export type WatchController = {
  add(target: ParsedWatchTarget): Promise<void>;
  setTriageState(ids: string[], state: WatchTriageState): void;
  reorderGroupWithinRepo(draggedIds: string[], targetIds: string[], position: WatchDropPosition): void;
  reorderWithinRepo(draggedId: string, targetId: string, position: WatchDropPosition): void;
  markSeen(id: string): void;
  markAllSeen(): void;
  markAllDone(state: WatchTriageState): void;
  markFinishedDone(state: WatchTriageState): void;
  clearDone(ids: string[]): void;
  refreshRepositoryIcons(): Promise<void>;
  refreshWatchMetadata(): Promise<void>;
  listActiveWorkflowRuns(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<ActiveWorkflowRun[]>;
  listOpenPullRequests(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<OpenPullRequest[]>;
  listWorkflowDefinitions(target: Pick<FavoriteRepo, "owner" | "repo">): Promise<WorkflowDefinition[]>;
  rerunFailed(id: string): Promise<void>;
  setOptions(options: WatchControllerOptions): void;
  syncWorkflowSubscriptions(favoriteRepos: FavoriteRepo[]): Promise<void>;
  pollNow(): Promise<void>;
  getWatches(): WatchRecord[];
  subscribe(listener: () => void): () => void;
};

export function createWatchController(
  deps: WatchControllerDeps,
  initialWatches: WatchRecord[] = [],
  initialOptions: WatchControllerOptions = {},
  initialSuppressions: WatchSuppression[] = [],
): WatchController {
  const initialNow = deps.now?.() ?? new Date();
  let normalizedDoneAt = false;
  const normalizedWatches = initialWatches.map(normalizeWatchSeenStatus).map((watch) => {
    const normalized = normalizeWatchDoneAt(watch, initialNow);
    normalizedDoneAt ||= normalized !== watch;
    return normalized;
  });
  let watches = clearExpiredDoneWatches(normalizedWatches, initialNow);
  let suppressions = clearExpiredWatchSuppressions(initialSuppressions, initialNow);
  let options: WatchControllerOptions = initialOptions;
  const listeners = new Set<() => void>();

  if (watches !== normalizedWatches) {
    const retainedIds = new Set(watches.map((watch) => watch.id));
    const clearedIds = normalizedWatches
      .filter((watch) => !retainedIds.has(watch.id))
      .map((watch) => watch.id);
    suppressions = addWatchSuppressions(suppressions, clearedIds, initialNow);
  }

  if (normalizedDoneAt || watches !== normalizedWatches) {
    void deps.save(watches);
  }

  if (suppressions !== initialSuppressions) {
    void deps.saveSuppressions(suppressions);
  }

  function getNow(): Date {
    return deps.now?.() ?? new Date();
  }

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

  function setSuppressions(nextSuppressions: WatchSuppression[]): void {
    if (nextSuppressions === suppressions) {
      return;
    }

    suppressions = nextSuppressions;
    void deps.saveSuppressions(suppressions);
  }

  function updateWatch(id: string, update: (watch: WatchRecord) => WatchRecord): void {
    setWatches(watches.map((watch) => (watch.id === id ? update(watch) : watch)));
  }

  function pruneExpiredDoneWatches(now = getNow()): void {
    const next = clearExpiredDoneWatches(watches, now);

    if (next !== watches) {
      const retainedIds = new Set(next.map((watch) => watch.id));
      const clearedIds = watches
        .filter((watch) => !retainedIds.has(watch.id))
        .map((watch) => watch.id);
      setSuppressions(addWatchSuppressions(suppressions, clearedIds, now));
      setWatches(next);
    }
  }

  function pruneExpiredSuppressions(now = getNow()): void {
    setSuppressions(clearExpiredWatchSuppressions(suppressions, now));
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
        label: getSnapshotLabel(watch, snapshot),
        metadata: mergeWatchMetadata(watch.metadata, snapshot.metadata),
        status,
        lastSeenStatus: status,
        lastState: {
          status: snapshot.status,
          conclusion: snapshot.conclusion,
          ...(snapshot.hasFailedChildren ? { hasFailedChildren: true } : {}),
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

  async function refreshPullRequestDetails(targets = getTrackedPullRequestTargets(watches)): Promise<void> {
    if (!deps.fetchPullRequestDetails) {
      return;
    }

    const uniqueTargets = new Map(targets.map((target) => [getPullRequestKey(target), target]));
    const detailsByKey = new Map<string, PullRequestDetails>();

    for (const target of uniqueTargets.values()) {
      try {
        const details = await deps.fetchPullRequestDetails(target);
        detailsByKey.set(getPullRequestKey(target), details);
      } catch {
        // Missing PR metadata should not interfere with check polling.
      }
    }

    const nextWatches = watches.map((watch) => {
      if (getWatchTriageState(watch) === "done") {
        return watch;
      }

      const target = getWatchPullRequestTarget(watch);
      const details = target ? detailsByKey.get(getPullRequestKey(target)) : undefined;
      return target && details ? withPullRequestDetails(watch, target, details) : watch;
    });

    if (nextWatches.some((watch, index) => watch !== watches[index])) {
      setWatches(nextWatches);
    }
  }

  async function refreshWatchPullRequestDetails(id: string): Promise<void> {
    const watch = watches.find((item) => item.id === id);
    const target = watch ? getWatchPullRequestTarget(watch) : undefined;

    if (target) {
      await refreshPullRequestDetails([target]);
    }
  }

  async function addWatchTarget(
    target: WatchTarget,
    reactivateExisting = false,
  ): Promise<void> {
    const id = getWatchId(target);

    if (!reactivateExisting && isWatchSuppressed(suppressions, id)) {
      return;
    }

    if (reactivateExisting) {
      setSuppressions(removeWatchSuppression(suppressions, id));
    }

    const previous = watches;
    const next = addWatch(watches, target);

    if (next === previous) {
      if (reactivateExisting) {
        const reactivated = setWatchesTriageState(watches, [id], "inbox", getNow());

        if (reactivated !== watches) {
          setWatches(reactivated);
          await loadBaselineState(id, target);
        }
      }
      return;
    }

    setWatches(next);

    void refreshRepositoryIcon(id, target);
    await loadBaselineState(id, target);
  }

  async function addPrWatch(source: PrWatchTarget): Promise<void> {
    await addWatchTarget(source, true);
    await refreshPullRequestDetails([source]);
  }

  function applyAutoDoneFinishedWatches(): void {
    if (!options.autoDoneFinishedWatches) {
      return;
    }

    const finishedIds = watches
      .filter(
        (watch) =>
          getWatchTriageState(watch) === "inbox" &&
          !watch.active &&
          !hasUnseenStatusChange(watch),
      )
      .map((watch) => watch.id);
    const nextWatches = setWatchesTriageState(watches, finishedIds, "done", getNow());

    if (nextWatches !== watches) {
      setWatches(nextWatches);
    }
  }

  async function syncFavoriteWorkflowSubscriptions(favorite: FavoriteRepo): Promise<void> {
    const defaultBranchWorkflowNames = favorite.defaultBranchWorkflowNames ?? [];
    const userWorkflowNames = favorite.userWorkflowNames ?? [];

    if (defaultBranchWorkflowNames.length === 0 && userWorkflowNames.length === 0) {
      return;
    }

    const targets = new Map<string, ActiveWorkflowRun>();

    if (defaultBranchWorkflowNames.length > 0) {
      if (!deps.fetchActiveWorkflowRuns) {
        throw new Error("Default branch workflow subscriptions need GitHub run listing support.");
      }

      if (!deps.fetchRepositoryDefaultBranch) {
        throw new Error("Default branch workflow subscriptions need GitHub repository support.");
      }

      const runs = await deps.fetchActiveWorkflowRuns(favorite);
      const defaultBranch = await deps.fetchRepositoryDefaultBranch(favorite);

      for (const run of runs) {
        if (
          run.branchName === defaultBranch &&
          workflowNameIsSelected(run.workflowName, defaultBranchWorkflowNames)
        ) {
          targets.set(run.runId, run);
        }
      }
    }

    if (userWorkflowNames.length > 0) {
      if (!deps.fetchUserActiveWorkflowRuns) {
        throw new Error("User workflow subscriptions need GitHub run listing support.");
      }

      const runs = await deps.fetchUserActiveWorkflowRuns(favorite);

      for (const run of runs) {
        if (workflowNameIsSelected(run.workflowName, userWorkflowNames)) {
          targets.set(run.runId, run);
        }
      }
    }

    for (const run of targets.values()) {
      await addSubscribedWorkflowRun(favorite, run);
    }
  }

  async function addSubscribedWorkflowRun(
    repo: Pick<FavoriteRepo, "owner" | "repo">,
    run: ActiveWorkflowRun,
  ): Promise<void> {
    await addWatchTarget({
      kind: "run",
      owner: repo.owner,
      repo: repo.repo,
      runId: run.runId,
      url: run.url,
    });
  }

  return {
    async add(target) {
      if (target.kind === "pr") {
        await addPrWatch(target);
        return;
      }

      await addWatchTarget(target, true);
      await refreshWatchPullRequestDetails(getWatchId(target));
    },

    setTriageState(ids, state) {
      const next = setWatchesTriageState(watches, ids, state, getNow());

      if (next !== watches) {
        setWatches(next);
      }
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
      applyAutoDoneFinishedWatches();
    },

    markAllSeen() {
      setWatches(markAllWatchesSeen(watches));
      applyAutoDoneFinishedWatches();
    },

    markAllDone(state) {
      const ids = watches
        .filter((watch) => state !== "done" && getWatchTriageState(watch) === state)
        .map((watch) => watch.id);
      const next = setWatchesTriageState(watches, ids, "done", getNow());

      if (next !== watches) {
        setWatches(next);
      }
    },

    markFinishedDone(state) {
      const ids = watches
        .filter(
          (watch) =>
            state !== "done" && getWatchTriageState(watch) === state && !watch.active,
        )
        .map((watch) => watch.id);
      const next = setWatchesTriageState(watches, ids, "done", getNow());

      if (next !== watches) {
        setWatches(next);
      }
    },

    clearDone(ids) {
      const idSet = new Set(ids);
      const doneIds = watches
        .filter(
          (watch) => idSet.has(watch.id) && getWatchTriageState(watch) === "done",
        )
        .map((watch) => watch.id);
      const next = clearDoneWatches(watches, doneIds);

      if (next !== watches) {
        setSuppressions(addWatchSuppressions(suppressions, doneIds, getNow()));
        setWatches(next);
      }
    },

    async refreshRepositoryIcons() {
      await Promise.all(watches.map((watch) => refreshRepositoryIcon(watch.id, watch.target)));
    },

    async refreshWatchMetadata() {
      const watchesMissingMetadata = watches.filter(
        (watch) => getWatchTriageState(watch) !== "done" && !watch.target.prNumber,
      );

      for (const watch of watchesMissingMetadata) {
        try {
          const snapshot = await deps.fetchState(watch.target);
          const nextState = {
            status: snapshot.status,
            conclusion: snapshot.conclusion,
            ...(snapshot.hasFailedChildren ? { hasFailedChildren: true } : {}),
          };
          const status = formatWatchState(nextState);

          updateWatch(watch.id, (current) => ({
            ...current,
            target: withSnapshotPrNumber(current.target, snapshot.prNumber),
            label: getSnapshotLabel(current, snapshot),
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

      await refreshPullRequestDetails();
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

    async listWorkflowDefinitions(target) {
      if (!deps.fetchWorkflowDefinitions) {
        throw new Error("Workflow subscription lists need GitHub workflow listing support.");
      }

      return deps.fetchWorkflowDefinitions(target);
    },

    async rerunFailed(id) {
      const watch = watches.find((item) => item.id === id);

      if (!watch || watch.target.kind === "pr" || !deps.rerunFailed) {
        return;
      }

      await deps.rerunFailed(watch.target);
      const reactivated = setWatchesTriageState(watches, [id], "inbox", getNow());
      setWatches(
        reactivated.map((current) =>
          current.id === id
            ? {
                ...current,
                active: true,
                error: undefined,
              }
            : current,
        ),
      );
    },

    setOptions(nextOptions) {
      options = { ...options, ...nextOptions };
    },

    async syncWorkflowSubscriptions(favoriteRepos) {
      pruneExpiredSuppressions();

      for (const favorite of favoriteRepos) {
        await syncFavoriteWorkflowSubscriptions(favorite);
      }
    },

    async pollNow() {
      const notificationTime = getNow();
      pruneExpiredSuppressions(notificationTime);
      pruneExpiredDoneWatches(notificationTime);
      const activeWatches = watches.filter(
        (watch) => watch.active && getWatchTriageState(watch) !== "done",
      );
      const rowNotifications: WatchNotification[] = [];

      for (const watch of activeWatches) {
        const snapshot = await deps.fetchState(watch.target);
        const nextState = {
          status: snapshot.status,
          conclusion: snapshot.conclusion,
          ...(snapshot.hasFailedChildren ? { hasFailedChildren: true } : {}),
        };
        const status = formatWatchState(nextState);
        const transition = getStatusTransition(watch.lastState, nextState);
        let changedWatch: WatchRecord | undefined;

        updateWatch(watch.id, (current) => {
          const nextWatch = {
            ...current,
            target: withSnapshotPrNumber(current.target, snapshot.prNumber),
            label: getSnapshotLabel(current, snapshot),
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
        applyAutoDoneFinishedWatches();
        return;
      }

      for (const notification of rowNotifications) {
        await deps.notify(notification);
      }

      applyAutoDoneFinishedWatches();
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

function workflowNameIsSelected(workflowName: string | undefined, selectedWorkflowNames: string[]): boolean {
  return Boolean(workflowName && selectedWorkflowNames.includes(workflowName));
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

function getSnapshotLabel(watch: WatchRecord, snapshot: WatchSnapshot): string {
  if (watch.target.kind !== "pr") {
    return snapshot.title;
  }

  return snapshot.metadata?.prTitle?.trim() ||
    watch.metadata?.prTitle?.trim() ||
    snapshot.title;
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

function getTrackedPullRequestTargets(watches: WatchRecord[]): PrWatchTarget[] {
  return watches
    .filter((watch) => getWatchTriageState(watch) !== "done")
    .map(getWatchPullRequestTarget)
    .filter((target): target is PrWatchTarget => Boolean(target));
}

function getWatchPullRequestTarget(watch: WatchRecord): PrWatchTarget | undefined {
  if (watch.target.kind === "pr") {
    return watch.target;
  }

  if (watch.source) {
    return watch.source;
  }

  if (!watch.target.prNumber) {
    return undefined;
  }

  return {
    kind: "pr",
    owner: watch.target.owner,
    repo: watch.target.repo,
    prNumber: watch.target.prNumber,
    url: `https://github.com/${watch.target.owner}/${watch.target.repo}/pull/${watch.target.prNumber}`,
  };
}

function withPullRequestDetails(
  watch: WatchRecord,
  target: PrWatchTarget,
  details: PullRequestDetails,
): WatchRecord {
  const source = watch.target.kind === "pr" ? watch.source : watch.source ?? target;
  const label = watch.target.kind === "pr" ? details.title : watch.label;

  if (
    watch.sourceState === details.state &&
    watch.label === label &&
    watch.metadata?.prTitle === details.title &&
    watch.source === source
  ) {
    return watch;
  }

  return {
    ...watch,
    ...(source ? { source } : {}),
    sourceState: details.state,
    label,
    metadata: mergeWatchMetadata(watch.metadata, { prTitle: details.title }),
  };
}

function getPullRequestKey(target: PrWatchTarget): string {
  return `${target.owner.toLowerCase()}/${target.repo.toLowerCase()}#${target.prNumber}`;
}
