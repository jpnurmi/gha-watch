import type { WatchedRepo } from "../domain/watchedRepos";
import type { WatchSubject, WatchTreeNodeKind } from "./viewModel";

export function getRepositoryUrl(repo: Pick<WatchedRepo, "owner" | "repo">): string {
  return `https://github.com/${repo.owner}/${repo.repo}`;
}

export function getWatchActionsUrl(
  subject: WatchSubject | WatchTreeNodeKind,
  url: string,
): string {
  return subject === "pull-request" ? `${url.replace(/\/+$/, "")}/checks` : url;
}
