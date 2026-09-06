import type { WatchedRepo } from "../domain/watchedRepos";
import type { WatchSubject } from "./viewModel";

export function getRepositoryUrl(repo: Pick<WatchedRepo, "owner" | "repo">): string {
  return `https://github.com/${repo.owner}/${repo.repo}`;
}

export function getWatchActionsUrl(
  subject: WatchSubject,
  url: string,
): string {
  return subject === "pull-request" ? `${url.replace(/\/+$/, "")}/checks` : url;
}
