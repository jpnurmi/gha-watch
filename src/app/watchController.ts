import {
  getWatchedRepoKey,
  getWorkflowSubscriptions,
  workflowRunMatchesSubscription,
  type WatchedRepo,
} from "../domain/watchedRepos";
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
import { isWorkflowRunActive, type RerunMode, type WatchSnapshot } from "../platform/gh";
import type {
  ActiveWorkflowRun,
  OpenPullRequest,
  PullRequestDetails,
  WorkflowRun,
  WorkflowRunDiscoveryBatch,
  WorkflowRunDiscoveryOptions,
  WorkflowDefinition,
} from "../platform/gh";
import { createWatchNotification, type WatchNotification } from "./watchNotification";

export type WatchControllerDeps = {
  fetchState(target: WatchTarget): Promise<WatchSnapshot>;
  fetchActiveWorkflowRuns?(target: Pick<WatchedRepo, "owner" | "repo">): Promise<ActiveWorkflowRun[]>;
  fetchWorkflowRuns?(
    target: Pick<WatchedRepo, "owner" | "repo">,
    options?: WorkflowRunDiscoveryOptions,
  ): Promise<WorkflowRunDiscoveryBatch>;
  fetchOpenPullRequests?(target: Pick<WatchedRepo, "owner" | "repo">): Promise<OpenPullRequest[]>;
  fetchPullRequestDetails?(targets: PrWatchTarget[]): Promise<Array<PullRequestDetails | undefined>>;
  fetchRepositoryDefaultBranch?(target: Pick<WatchedRepo, "owner" | "repo">): Promise<string>;
  fetchRepositoryBranches?(target: Pick<WatchedRepo, "owner" | "repo">): Promise<string[]>;
  fetchRepositoryIconUrl?(target: Pick<ParsedWatchTarget, "owner" | "repo">): Promise<string | undefined>;
  fetchUserActiveWorkflowRuns?(target: Pick<WatchedRepo, "owner" | "repo">): Promise<ActiveWorkflowRun[]>;
  fetchWorkflowDefinitions?(target: Pick<WatchedRepo, "owner" | "repo">): Promise<WorkflowDefinition[]>;
  getAuthenticatedUserLogin?(): Promise<string>;
  notificationsPaused?(): boolean;
  notify(notification: WatchNotification): Promise<void>;
  rerun?(target: WatchTarget, mode: RerunMode): Promise<void>;
  now?(): Date;
  save(watches: WatchRecord[]): Promise<void>;
  saveSuppressions(suppressions: WatchSuppression[]): Promise<void>;
};

export type WatchController = {
  add(target: ParsedWatchTarget): Promise<void>;
  replaceSyncedWatches(watches: WatchRecord[]): void;
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
  listActiveWorkflowRuns(target: Pick<WatchedRepo, "owner" | "repo">): Promise<ActiveWorkflowRun[]>;
  listOpenPullRequests(target: Pick<WatchedRepo, "owner" | "repo">): Promise<OpenPullRequest[]>;
  listRepositoryBranches(target: Pick<WatchedRepo, "owner" | "repo">): Promise<string[]>;
  listWorkflowDefinitions(target: Pick<WatchedRepo, "owner" | "repo">): Promise<WorkflowDefinition[]>;
  rerun(id: string, mode: RerunMode): Promise<void>;
  syncWorkflowSubscriptions(watchedRepos: WatchedRepo[]): Promise<void>;
  pollNow(options?: WatchPollOptions): Promise<void>;
  getWatches(): WatchRecord[];
  subscribe(listener: () => void): () => void;
};

export type WatchPollOptions = {
  triageState?: Exclude<WatchTriageState, "done">;
  includeInactive?: boolean;
  watchIds?: string[];
};

type WorkflowDiscoveryState = {
  cursor: string;
  overlapEnabled: boolean;
  catchUp?: {
    after: string;
    before: string;
    nextPage: number;
  };
};

const workflowDiscoveryOverlapMs = 60_000;

export function createWatchController(
  deps: WatchControllerDeps,
  initialWatches: WatchRecord[] = [],
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
  const metadataHydratedWatchIds = new Set<string>();
  const repositoryIconRefreshes = new Map<string, Promise<void>>();
  const workflowDiscoveryStates = new Map<string, WorkflowDiscoveryState>();
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

  function setWatchesWithDonePruning(nextWatches: WatchRecord[], now = getNow()): void {
    const retainedWatches = clearExpiredDoneWatches(nextWatches, now);

    if (retainedWatches !== nextWatches) {
      const retainedIds = new Set(retainedWatches.map((watch) => watch.id));
      const clearedIds = nextWatches
        .filter((watch) => !retainedIds.has(watch.id))
        .map((watch) => watch.id);
      setSuppressions(addWatchSuppressions(suppressions, clearedIds, now));
    }

    setWatches(retainedWatches);
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

  async function refreshRepositoryIcon(target: ParsedWatchTarget): Promise<void> {
    if (!deps.fetchRepositoryIconUrl) {
      return;
    }

    const repoKey = getRepositoryKey(target);
    const pending = repositoryIconRefreshes.get(repoKey);

    if (pending) {
      return pending;
    }

    const refresh = refreshRepositoryIconNow(target);
    repositoryIconRefreshes.set(repoKey, refresh);

    try {
      await refresh;
    } finally {
      if (repositoryIconRefreshes.get(repoKey) === refresh) {
        repositoryIconRefreshes.delete(repoKey);
      }
    }
  }

  async function refreshRepositoryIconNow(target: ParsedWatchTarget): Promise<void> {
    const repoKey = getRepositoryKey(target);
    const repoWatches = watches.filter((watch) => getRepositoryKey(watch.target) === repoKey);

    if (repoWatches.every((watch) => watch.repoIconUrl)) {
      return;
    }

    try {
      const existingIcon = repoWatches.find((watch) => watch.repoIconUrl)?.repoIconUrl;
      const repoIconUrl = existingIcon ?? await deps.fetchRepositoryIconUrl?.(target);

      if (!repoIconUrl) {
        return;
      }

      const nextWatches = watches.map((watch) =>
        getRepositoryKey(watch.target) === repoKey && !watch.repoIconUrl
          ? { ...watch, repoIconUrl }
          : watch,
      );

      if (nextWatches.some((watch, index) => watch !== watches[index])) {
        setWatches(nextWatches);
      }
    } catch {
      // Missing avatars should not interfere with status watching.
    }
  }

  async function loadBaselineState(id: string, target: WatchTarget): Promise<void> {
    try {
      const snapshot = await deps.fetchState(target);
      updateWatch(id, (watch) => withBaselineSnapshot(watch, snapshot));
    } catch (error) {
      updateWatch(id, (watch) => ({
        ...watch,
        status: "error",
        lastSeenStatus: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function createBaselineWatch(target: WatchTarget): Promise<WatchRecord> {
    const [watch] = addWatch([], target);

    try {
      const snapshot = await deps.fetchState(target);
      metadataHydratedWatchIds.add(watch.id);
      return withBaselineSnapshot(watch, snapshot);
    } catch (error) {
      return {
        ...watch,
        status: "error",
        lastSeenStatus: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function refreshPullRequestDetails(targets = getTrackedPullRequestTargets(watches)): Promise<void> {
    if (!deps.fetchPullRequestDetails) {
      return;
    }

    const uniqueTargets = new Map(targets.map((target) => [getPullRequestKey(target), target]));
    const detailsByKey = new Map<string, PullRequestDetails>();
    const batch = [...uniqueTargets.values()];

    if (batch.length === 0) {
      return;
    }

    try {
      const details = await deps.fetchPullRequestDetails(batch);

      batch.forEach((target, index) => {
        const result = details[index];

        if (result) {
          detailsByKey.set(getPullRequestKey(target), result);
        }
      });
    } catch {
      // Missing PR metadata should not interfere with check polling.
    }

    if (detailsByKey.size === 0) {
      return;
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

  async function hydrateLegacyWatchMetadata(triageState?: WatchTriageState): Promise<void> {
    const watchesMissingMetadata = watches.filter(
      (watch) =>
        getWatchTriageState(watch) !== "done" &&
        (!triageState || getWatchTriageState(watch) === triageState) &&
        !watch.active &&
        watch.target.kind !== "pr" &&
        !watch.target.prNumber &&
        !metadataHydratedWatchIds.has(watch.id),
    );

    for (const watch of watchesMissingMetadata) {
      metadataHydratedWatchIds.add(watch.id);

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
        // Metadata hydration should not turn existing watches into error rows.
      }
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

    const existingWatch = watches.find((watch) => watch.id === id);

    if (existingWatch) {
      if (reactivateExisting) {
        const reactivated = setWatchesTriageState(watches, [id], "inbox", getNow());

        if (reactivated !== watches) {
          setWatches(reactivated);
          await loadBaselineState(id, target);
        }
      }
      return;
    }

    const baselineWatch = await createBaselineWatch(target);

    if (
      watches.some((watch) => watch.id === id) ||
      (!reactivateExisting && isWatchSuppressed(suppressions, id))
    ) {
      return;
    }

    setWatches([...watches, baselineWatch]);

    void refreshRepositoryIcon(target);
  }

  async function addPrWatch(source: PrWatchTarget): Promise<void> {
    await addWatchTarget(source, true);
    await refreshPullRequestDetails([source]);
  }

  async function syncWatchedWorkflowSubscriptions(watchedRepo: WatchedRepo): Promise<void> {
    if (watchedRepo.workflowSubscriptions) {
      await syncNormalizedWorkflowSubscriptions(watchedRepo);
      return;
    }

    const defaultBranchWorkflowNames = watchedRepo.defaultBranchWorkflowNames ?? [];
    const userWorkflowNames = watchedRepo.userWorkflowNames ?? [];
    const needsPullRequestList = Boolean(watchedRepo.pullRequestScope) || userWorkflowNames.length > 0;
    const needsUserLogin = watchedRepo.pullRequestScope === "user" || userWorkflowNames.length > 0;
    let openPullRequests: OpenPullRequest[] = [];
    let userLogin = "";

    if (needsPullRequestList && !deps.fetchOpenPullRequests) {
      throw new Error("Pull request watches need GitHub PR listing support.");
    }

    if (needsUserLogin && !deps.getAuthenticatedUserLogin) {
      throw new Error("User watches need GitHub authentication support.");
    }

    [openPullRequests, userLogin] = await Promise.all([
      needsPullRequestList ? deps.fetchOpenPullRequests!(watchedRepo) : Promise.resolve([]),
      needsUserLogin ? deps.getAuthenticatedUserLogin!() : Promise.resolve(""),
    ]);

    if (watchedRepo.pullRequestScope) {
      for (const pullRequest of openPullRequests) {
        if (
          watchedRepo.pullRequestScope === "all" ||
          pullRequest.authorLogin?.toLowerCase() === userLogin.toLowerCase()
        ) {
          await syncSubscribedPullRequest(watchedRepo, pullRequest, true);
        }
      }
    }

    const targets = new Map<string, ActiveWorkflowRun>();

    if (defaultBranchWorkflowNames.length > 0) {
      if (!deps.fetchActiveWorkflowRuns) {
        throw new Error("Default branch workflow subscriptions need GitHub run listing support.");
      }

      if (!deps.fetchRepositoryDefaultBranch) {
        throw new Error("Default branch workflow subscriptions need GitHub repository support.");
      }

      const runs = await deps.fetchActiveWorkflowRuns(watchedRepo);
      const defaultBranch = await deps.fetchRepositoryDefaultBranch(watchedRepo);

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

      const runs = await deps.fetchUserActiveWorkflowRuns(watchedRepo);

      for (const run of runs) {
        if (
          run.event !== "workflow_dispatch" ||
          !workflowNameIsSelected(run.workflowName, userWorkflowNames)
        ) {
          continue;
        }

        const pullRequest = openPullRequests.find(
          (candidate) => candidate.headBranch?.trim() === run.branchName,
        );

        if (pullRequest) {
          if (pullRequest.authorLogin?.toLowerCase() === userLogin.toLowerCase()) {
            await syncSubscribedPullRequest(watchedRepo, pullRequest, true);
          }
        } else {
          targets.set(run.runId, run);
        }
      }
    }

    for (const run of targets.values()) {
      await addSubscribedWorkflowRun(watchedRepo, run);
    }
  }

  async function syncNormalizedWorkflowSubscriptions(watchedRepo: WatchedRepo): Promise<void> {
    const subscriptions = getWorkflowSubscriptions(watchedRepo);
    const repoKey = getWatchedRepoKey(watchedRepo);
    const discoveryState = workflowDiscoveryStates.get(repoKey);
    const scanStartedAt = getNow().toISOString();
    const catchUpScan = discoveryState
      ? discoveryState.catchUp ?? {
          after: discoveryState.overlapEnabled
            ? getWorkflowDiscoveryOverlapStart(discoveryState.cursor)
            : discoveryState.cursor,
          before: scanStartedAt,
          nextPage: 1,
        }
      : undefined;
    const hasCurrentUserDispatchSubscription = subscriptions.some(
      (subscription) =>
        subscription.actor === "currentUser" &&
        (subscription.events.includes("*") || subscription.events.includes("workflow_dispatch")),
    );
    const needsPullRequestList = Boolean(watchedRepo.pullRequestScope) || hasCurrentUserDispatchSubscription;
    const needsDefaultBranch = subscriptions.some((subscription) => subscription.branch.kind === "default");
    const needsUserLogin = watchedRepo.pullRequestScope === "user" ||
      subscriptions.some((subscription) => subscription.actor === "currentUser");

    if (needsPullRequestList && !deps.fetchOpenPullRequests) {
      throw new Error("Pull request watches need GitHub PR listing support.");
    }

    if (subscriptions.length > 0 && !deps.fetchWorkflowRuns) {
      throw new Error("Workflow subscriptions need GitHub run listing support.");
    }

    if (needsDefaultBranch && !deps.fetchRepositoryDefaultBranch) {
      throw new Error("Default branch workflow subscriptions need GitHub repository support.");
    }

    if (needsUserLogin && !deps.getAuthenticatedUserLogin) {
      throw new Error("User watches need GitHub authentication support.");
    }

    const [openPullRequests, runBatch, defaultBranch, userLogin] = await Promise.all([
      needsPullRequestList ? deps.fetchOpenPullRequests!(watchedRepo) : Promise.resolve([]),
      subscriptions.length > 0
        ? deps.fetchWorkflowRuns!(watchedRepo, catchUpScan
            ? {
                createdAfter: catchUpScan.after,
                createdBefore: catchUpScan.before,
                catchUpPage: catchUpScan.nextPage,
              }
            : {})
        : Promise.resolve({ runs: [] } as WorkflowRunDiscoveryBatch),
      needsDefaultBranch ? deps.fetchRepositoryDefaultBranch!(watchedRepo) : Promise.resolve(""),
      needsUserLogin ? deps.getAuthenticatedUserLogin!() : Promise.resolve(""),
    ]);

    if (watchedRepo.pullRequestScope) {
      for (const pullRequest of openPullRequests) {
        if (
          watchedRepo.pullRequestScope === "all" ||
          pullRequest.authorLogin?.toLowerCase() === userLogin.toLowerCase()
        ) {
          await syncSubscribedPullRequest(watchedRepo, pullRequest, true);
        }
      }
    }

    const targets = new Map<string, { run: WorkflowRun; caughtUp: boolean }>();

    for (const run of runBatch.runs) {
      const caughtUp = Boolean(discoveryState);

      if (!isWorkflowRunActive(run) && (!caughtUp || run.status !== "completed")) {
        continue;
      }

      const matchingSubscriptions = subscriptions.filter((subscription) => workflowRunMatchesSubscription(
        run,
        subscription,
        { defaultBranch, currentUserLogin: userLogin },
      ));

      if (matchingSubscriptions.length === 0) {
        continue;
      }

      const aggregatesAuthoredPullRequest =
        run.event === "workflow_dispatch" &&
        matchingSubscriptions.some((subscription) => subscription.actor === "currentUser");

      if (aggregatesAuthoredPullRequest) {
        const pullRequest = openPullRequests.find(
          (candidate) => candidate.headBranch?.trim() === run.branchName,
        );

        if (pullRequest) {
          if (pullRequest.authorLogin?.toLowerCase() === userLogin.toLowerCase()) {
            await syncSubscribedPullRequest(watchedRepo, pullRequest, true);
          }

          continue;
        }
      }

      targets.set(run.runId, { run, caughtUp });
    }

    for (const { run, caughtUp } of targets.values()) {
      await addSubscribedWorkflowRun(watchedRepo, run, caughtUp);
    }

    if (!discoveryState) {
      workflowDiscoveryStates.set(repoKey, { cursor: scanStartedAt, overlapEnabled: false });
    } else if (catchUpScan && runBatch.nextCatchUpPage) {
      workflowDiscoveryStates.set(repoKey, {
        cursor: discoveryState.cursor,
        overlapEnabled: discoveryState.overlapEnabled,
        catchUp: {
          ...catchUpScan,
          nextPage: runBatch.nextCatchUpPage,
        },
      });
    } else if (catchUpScan) {
      workflowDiscoveryStates.set(repoKey, { cursor: catchUpScan.before, overlapEnabled: true });
    }
  }

  async function syncSubscribedPullRequest(
    repo: Pick<WatchedRepo, "owner" | "repo">,
    pullRequest: OpenPullRequest,
    refreshInactive = false,
  ): Promise<void> {
    const target = {
      kind: "pr",
      owner: repo.owner,
      repo: repo.repo,
      prNumber: pullRequest.number,
      url: pullRequest.url,
    } as const;
    const id = getWatchId(target);
    const existingWatch = watches.find((watch) => watch.id === id);

    if (existingWatch && getWatchTriageState(existingWatch) !== "inbox") {
      return;
    }

    if (!existingWatch) {
      await addWatchTarget(target);
    } else if (
      (refreshInactive && !existingWatch.active) ||
      (pullRequest.updatedAt && pullRequest.updatedAt !== existingWatch.metadata?.prUpdatedAt)
    ) {
      await loadBaselineState(id, target);
    }

    const currentWatch = watches.find((watch) => watch.id === id);

    if (!currentWatch) {
      return;
    }

    const metadata = mergeWatchMetadata(currentWatch.metadata, {
      prTitle: pullRequest.title,
      ...(pullRequest.updatedAt ? { prUpdatedAt: pullRequest.updatedAt } : {}),
      ...(pullRequest.headBranch ? { branchName: pullRequest.headBranch } : {}),
    });
    const sourceState = pullRequest.isDraft ? "draft" : "ready";

    if (
      currentWatch.label === pullRequest.title &&
      currentWatch.metadata?.prTitle === metadata?.prTitle &&
      currentWatch.metadata?.prUpdatedAt === metadata?.prUpdatedAt &&
      currentWatch.metadata?.branchName === metadata?.branchName &&
      currentWatch.sourceState === sourceState
    ) {
      return;
    }

    updateWatch(id, (watch) => ({
      ...watch,
      label: pullRequest.title,
      metadata,
      sourceState,
    }));
  }

  async function addSubscribedWorkflowRun(
    repo: Pick<WatchedRepo, "owner" | "repo">,
    run: ActiveWorkflowRun,
    caughtUp = false,
  ): Promise<void> {
    const target = {
      kind: "run",
      owner: repo.owner,
      repo: repo.repo,
      runId: run.runId,
      url: run.url,
    } as const;

    const id = getWatchId(target);
    const existingWatch = watches.find((watch) => watch.id === id);

    if (existingWatch) {
      reuseTrackedPullRequestForSubscribedRun(existingWatch, target, run);
      return;
    }

    if (isWatchSuppressed(suppressions, id)) {
      return;
    }

    const activeTrackedPullRequest = findTrackedPullRequestByBranch(
      getTrackedPullRequests(target),
      run.branchName,
      run,
    );

    if (activeTrackedPullRequest?.active) {
      return;
    }

    const subscribedWatch = await createBaselineWatch(target);

    const concurrentlyAddedWatch = watches.find((watch) => watch.id === id);

    if (concurrentlyAddedWatch) {
      reuseTrackedPullRequestForSubscribedRun(concurrentlyAddedWatch, target, run);
      return;
    }

    if (isWatchSuppressed(suppressions, id)) {
      return;
    }

    if (reuseTrackedPullRequestForSubscribedRun(subscribedWatch, target, run)) {
      return;
    }

    const publishedWatch = caughtUp && subscribedWatch.lastState?.status === "completed"
      ? { ...subscribedWatch, lastSeenStatus: "pending" }
      : subscribedWatch;
    setWatches([...watches, publishedWatch]);
    void refreshRepositoryIcon(target);

    if (caughtUp && publishedWatch.lastState?.status === "completed" && !deps.notificationsPaused?.()) {
      await deps.notify(createWatchNotification(publishedWatch, getNow()));
    }
  }

  function reuseTrackedPullRequestForSubscribedRun(
    subscribedWatch: WatchRecord,
    target: CheckWatchTarget,
    run: ActiveWorkflowRun,
  ): boolean {
    const trackedPullRequests = getTrackedPullRequests(target);
    const pullRequestTarget = getWatchPullRequestTarget(subscribedWatch);
    const trackedPullRequest = pullRequestTarget
      ? trackedPullRequests.find(
          (watch) => getPullRequestKey(watch.target) === getPullRequestKey(pullRequestTarget),
        )
      : findTrackedPullRequestByBranch(
          trackedPullRequests,
          subscribedWatch.metadata?.branchName || run.branchName,
          run,
        );

    if (!trackedPullRequest) {
      return false;
    }

    const nextTrackedPullRequest = trackedPullRequest.active
      ? trackedPullRequest
      : {
          ...trackedPullRequest,
          status: subscribedWatch.status,
          lastSeenStatus: subscribedWatch.lastSeenStatus,
          lastState: subscribedWatch.lastState,
          timing: subscribedWatch.timing,
          active: true,
          error: subscribedWatch.error,
        };

    const subscribedWatchIsPublished = watches.some((watch) => watch.id === subscribedWatch.id);

    if (subscribedWatchIsPublished || nextTrackedPullRequest !== trackedPullRequest) {
      setWatches(
        watches
          .filter((watch) => watch.id !== subscribedWatch.id)
          .map((watch) => (watch.id === trackedPullRequest.id ? nextTrackedPullRequest : watch)),
      );
    }

    return true;
  }

  function getTrackedPullRequests(
    target: CheckWatchTarget,
  ): Array<WatchRecord & { target: PrWatchTarget }> {
    return watches.filter(
      (watch): watch is WatchRecord & { target: PrWatchTarget } =>
        watch.target.kind === "pr" &&
        getWatchTriageState(watch) !== "done" &&
        getRepositoryKey(watch.target) === getRepositoryKey(target),
    );
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

    replaceSyncedWatches(syncedWatches) {
      const now = getNow();
      const retainedSyncedWatches = clearExpiredDoneWatches(
        syncedWatches
          .map(normalizeWatchSeenStatus)
          .map((watch) => normalizeWatchDoneAt(watch, now)),
        now,
      );
      const syncedIds = new Set(retainedSyncedWatches.map((watch) => watch.id));
      const localInboxWatches = watches.filter(
        (watch) => getWatchTriageState(watch) === "inbox" && !syncedIds.has(watch.id),
      );
      const next = [...localInboxWatches, ...retainedSyncedWatches];

      if (JSON.stringify(next) !== JSON.stringify(watches)) {
        setWatchesWithDonePruning(next, now);
      }
    },

    setTriageState(ids, state) {
      const now = getNow();
      const next = setWatchesTriageState(watches, ids, state, now);

      if (next !== watches) {
        state === "done" ? setWatchesWithDonePruning(next, now) : setWatches(next);
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
    },

    markAllSeen() {
      setWatches(markAllWatchesSeen(watches));
    },

    markAllDone(state) {
      const now = getNow();
      const ids = watches
        .filter((watch) => state !== "done" && getWatchTriageState(watch) === state)
        .map((watch) => watch.id);
      const next = setWatchesTriageState(watches, ids, "done", now);

      if (next !== watches) {
        setWatchesWithDonePruning(next, now);
      }
    },

    markFinishedDone(state) {
      const now = getNow();
      const ids = watches
        .filter(
          (watch) =>
            state !== "done" && getWatchTriageState(watch) === state && !watch.active,
        )
        .map((watch) => watch.id);
      const next = setWatchesTriageState(watches, ids, "done", now);

      if (next !== watches) {
        setWatchesWithDonePruning(next, now);
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
      const repositories = new Map<string, ParsedWatchTarget>();

      for (const watch of watches) {
        const repoKey = getRepositoryKey(watch.target);

        if (!repositories.has(repoKey)) {
          repositories.set(repoKey, watch.target);
        }
      }

      await Promise.all([...repositories.values()].map(refreshRepositoryIcon));
    },

    async refreshWatchMetadata() {
      await hydrateLegacyWatchMetadata();
      await refreshPullRequestDetails();
    },

    async listActiveWorkflowRuns(target) {
      if (deps.fetchActiveWorkflowRuns) {
        return deps.fetchActiveWorkflowRuns(target);
      }

      if (!deps.fetchWorkflowRuns) {
        throw new Error("Active workflow run lists need GitHub run listing support.");
      }

      return (await deps.fetchWorkflowRuns(target)).runs.filter(isWorkflowRunActive);
    },

    async listOpenPullRequests(target) {
      if (!deps.fetchOpenPullRequests) {
        throw new Error("Open pull request lists need GitHub PR listing support.");
      }

      return deps.fetchOpenPullRequests(target);
    },

    async listRepositoryBranches(target) {
      if (!deps.fetchRepositoryBranches) {
        throw new Error("Workflow branch choices need GitHub branch listing support.");
      }

      return deps.fetchRepositoryBranches(target);
    },

    async listWorkflowDefinitions(target) {
      if (!deps.fetchWorkflowDefinitions) {
        throw new Error("Workflow subscription lists need GitHub workflow listing support.");
      }

      return deps.fetchWorkflowDefinitions(target);
    },

    async rerun(id, mode) {
      const watch = watches.find((item) => item.id === id);

      if (!watch || !deps.rerun) {
        return;
      }

      await deps.rerun(watch.target, mode);
      const rerunAt = getNow();
      const queuedState = { status: "queued", conclusion: null };
      const reactivated = setWatchesTriageState(watches, [id], "inbox", rerunAt);
      setWatches(
        reactivated.map((current) =>
          current.id === id
            ? {
                ...current,
                status: formatWatchState(queuedState),
                lastSeenStatus: formatWatchState(queuedState),
                lastState: queuedState,
                timing: { queuedAt: rerunAt.toISOString() },
                active: true,
                error: undefined,
              }
            : current,
        ),
      );
    },

    async syncWorkflowSubscriptions(watchedRepos) {
      pruneExpiredSuppressions();
      const normalizedSubscriptionRepoKeys = new Set(
        watchedRepos
          .filter((repo) => Boolean(repo.workflowSubscriptions?.length))
          .map(getWatchedRepoKey),
      );

      for (const repoKey of workflowDiscoveryStates.keys()) {
        if (!normalizedSubscriptionRepoKeys.has(repoKey)) {
          workflowDiscoveryStates.delete(repoKey);
        }
      }

      for (const watchedRepo of watchedRepos) {
        await syncWatchedWorkflowSubscriptions(watchedRepo);
      }
    },

    async pollNow(pollOptions = {}) {
      const notificationTime = getNow();
      const triageState = pollOptions.triageState ?? "inbox";
      const watchIdSet = pollOptions.watchIds ? new Set(pollOptions.watchIds) : undefined;
      pruneExpiredSuppressions(notificationTime);
      pruneExpiredDoneWatches(notificationTime);
      const polledWatches = watches.filter(
        (watch) =>
          getWatchTriageState(watch) === triageState &&
          (watch.active || pollOptions.includeInactive) &&
          (!watchIdSet || watchIdSet.has(watch.id)),
      );

      if (!pollOptions.includeInactive && !watchIdSet) {
        await hydrateLegacyWatchMetadata(triageState);
      }

      const rowNotifications: WatchNotification[] = [];

      for (const watch of polledWatches) {
        const snapshot = await deps.fetchState(watch.target);
        metadataHydratedWatchIds.add(watch.id);
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
            timing: mergePolledTiming(current, snapshot),
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

        if (getWatchTriageState(changedWatch) === "inbox") {
          rowNotifications.push(createWatchNotification(changedWatch, notificationTime));
        }
      }

      await refreshPullRequestDetails(
        getTrackedPullRequestTargets(
          watches.filter(
            (watch) =>
              getWatchTriageState(watch) === triageState &&
              (!watchIdSet || watchIdSet.has(watch.id)),
          ),
        ),
      );

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

function getWorkflowDiscoveryOverlapStart(cursor: string): string {
  const timestamp = Date.parse(cursor);
  return new Date(timestamp - workflowDiscoveryOverlapMs).toISOString();
}

function mergePolledTiming(
  current: Pick<WatchRecord, "lastState" | "timing">,
  snapshot: WatchSnapshot,
): WatchRecord["timing"] {
  if (
    current.lastState?.status !== "queued" ||
    !current.timing?.queuedAt ||
    !isQueuedStatus(snapshot.status)
  ) {
    return snapshot.timing;
  }

  return {
    ...snapshot.timing,
    queuedAt: current.timing.queuedAt,
  };
}

function isQueuedStatus(status: string): boolean {
  return status === "queued" || status === "pending" || status === "requested" || status === "waiting";
}

function workflowNameIsSelected(workflowName: string | undefined, selectedWorkflowNames: string[]): boolean {
  return Boolean(workflowName && selectedWorkflowNames.includes(workflowName));
}

function withBaselineSnapshot(watch: WatchRecord, snapshot: WatchSnapshot): WatchRecord {
  const status = formatWatchState(snapshot);

  return {
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
  const metadata = mergeWatchMetadata(watch.metadata, {
    prTitle: details.title,
    ...(details.branchName ? { branchName: details.branchName } : {}),
  });

  if (
    watch.sourceState === details.state &&
    watch.label === label &&
    watch.metadata?.prTitle === metadata?.prTitle &&
    watch.metadata?.branchName === metadata?.branchName &&
    watch.source === source
  ) {
    return watch;
  }

  return {
    ...watch,
    ...(source ? { source } : {}),
    sourceState: details.state,
    label,
    metadata,
  };
}

function getPullRequestKey(target: PrWatchTarget): string {
  return `${target.owner.toLowerCase()}/${target.repo.toLowerCase()}#${target.prNumber}`;
}

function findTrackedPullRequestByBranch(
  trackedPullRequests: Array<WatchRecord & { target: PrWatchTarget }>,
  branchName: string | undefined,
  run: ActiveWorkflowRun,
): WatchRecord | undefined {
  if (
    run.event !== "pull_request" &&
    run.event !== "pull_request_target" &&
    run.event !== "workflow_dispatch"
  ) {
    return undefined;
  }

  const cleanBranchName = branchName?.trim();

  if (!cleanBranchName) {
    return undefined;
  }

  const matches = trackedPullRequests.filter(
    (watch) => watch.metadata?.branchName?.trim() === cleanBranchName,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function getRepositoryKey(target: Pick<ParsedWatchTarget, "owner" | "repo">): string {
  return `${target.owner.toLowerCase()}/${target.repo.toLowerCase()}`;
}
