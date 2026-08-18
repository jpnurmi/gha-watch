import type { WatchedRepo } from "../domain/watchedRepos";
import type { AuthoredOpenPullRequest } from "../platform/gh";

export function getUnwatchedPullRequests(
  pullRequests: AuthoredOpenPullRequest[],
  watchedRepos: WatchedRepo[],
  watchedPullRequestIds: string[],
  dismissedPullRequestIds: string[],
): AuthoredOpenPullRequest[] {
  const subscribedRepoKeys = new Set(
    watchedRepos
      .filter((repo) => Boolean(repo.pullRequestScope))
      .map(getRepoKey),
  );
  const excludedIds = new Set(
    [...watchedPullRequestIds, ...dismissedPullRequestIds].map((id) => id.toLowerCase()),
  );
  const seen = new Set<string>();

  return pullRequests
    .filter((pullRequest) => {
      const id = getPullRequestDiscoveryId(pullRequest);

      if (subscribedRepoKeys.has(getRepoKey(pullRequest)) || excludedIds.has(id) || seen.has(id)) {
        return false;
      }

      seen.add(id);
      return true;
    })
    .sort((left, right) =>
      getTimestamp(right.updatedAt) - getTimestamp(left.updatedAt) ||
      getPullRequestDiscoveryId(left).localeCompare(getPullRequestDiscoveryId(right)),
    );
}

export function getPullRequestDiscoveryId(
  pullRequest: Pick<AuthoredOpenPullRequest, "owner" | "repo" | "number">,
): string {
  return `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`.toLowerCase();
}

function getRepoKey(repo: Pick<WatchedRepo, "owner" | "repo">): string {
  return `${repo.owner}/${repo.repo}`.toLowerCase();
}

function getTimestamp(value: string | undefined): number {
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}
