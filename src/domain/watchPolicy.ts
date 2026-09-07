import { getWatchState, type WatchRecord } from "./watches";

export function isDoneCandidate(
  watch: WatchRecord,
  tone: string,
  repoCiStatus?: { defaultBranch?: string; commitSha?: string },
): boolean {
  if (isPullRequestWatch(watch)) {
    return watch.sourceState === "merged" || watch.sourceState === "closed";
  }

  if (tone === "success") {
    return true;
  }

  if (tone !== "cancelled" || watch.target.kind !== "run") {
    return false;
  }

  const branchName = watch.metadata?.branchName?.trim();
  const runCommitSha = watch.metadata?.commitSha?.trim();
  const defaultBranch = repoCiStatus?.defaultBranch?.trim();
  const defaultBranchCommitSha = repoCiStatus?.commitSha?.trim();

  return Boolean(
    branchName &&
      runCommitSha &&
      defaultBranch &&
      defaultBranchCommitSha &&
      branchName === defaultBranch &&
      runCommitSha.toLowerCase() !== defaultBranchCommitSha.toLowerCase(),
  );
}

export function isDeemphasizedPullRequest(watch: WatchRecord): boolean {
  if (!isPullRequestWatch(watch)) {
    return false;
  }

  const title = watch.metadata?.prTitle?.trim() ||
    (watch.target.kind === "pr" ? getWatchDisplayLabel(watch) : "");
  return watch.sourceState === "draft" || /\bWIP\b/i.test(title);
}

export function isPullRequestWatch(watch: WatchRecord): boolean {
  return watch.target.kind === "pr" || Boolean(watch.target.prNumber || watch.source || watch.sourceState);
}

export function getWatchDisplayLabel(watch: WatchRecord): string {
  if (watch.target.kind !== "pr") {
    return watch.label;
  }

  return watch.metadata?.prTitle?.trim() || watch.label;
}

export function canRerun(watch: WatchRecord): boolean {
  const state = getWatchState(watch);

  return state?.status === "completed" &&
    state.conclusion !== "success" &&
    state.conclusion !== "skipped";
}

export function canRerunFailed(watch: WatchRecord): boolean {
  const state = getWatchState(watch);

  return state?.status === "completed" &&
    state.conclusion !== "success" &&
    state.conclusion !== "cancelled" &&
    state.conclusion !== "skipped";
}
