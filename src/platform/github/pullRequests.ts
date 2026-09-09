import { type AuthoredOpenPullRequest, type OpenPullRequest, type OpenPullRequestCheckOptions, type PullRequestDetailsBatch } from "../../app/githubPort";
import { type ParsedWatchTarget, type PrWatchTarget } from "../../domain/githubUrl";
import { assertSuccessfulGhResult, normalizeGhError, parseJson } from "../ghProtocol";
import { createTauriShellExecutor, type ShellExecutor } from "../shell";
import { comparePullRequestsByUpdatedAt, createPullRequestDetailsQuery, normalizeAuthoredOpenPullRequest, normalizeOpenPullRequest, normalizePullRequestDetails } from "./normalize";
import { type PullRequestDetailsQueryResponse, type PullRequestListResponse, type PullRequestSearchResponse } from "./responses";

export async function fetchOpenPullRequests(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<OpenPullRequest[]> {
  return fetchOpenPullRequestList(target, false, undefined, executor);
}

export async function fetchOpenPullRequestsWithChecks(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  options: OpenPullRequestCheckOptions = {},
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<OpenPullRequest[]> {
  return fetchOpenPullRequestList(target, true, options.author, executor);
}

async function fetchOpenPullRequestList(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  includeChecks: boolean,
  author: "@me" | undefined,
  executor: ShellExecutor,
): Promise<OpenPullRequest[]> {
  try {
    const args = [
      "pr",
      "list",
      "-R",
      `${target.owner}/${target.repo}`,
      "--state",
      "open",
      "--limit",
      "100",
      ...(author ? ["--author", author] : []),
      "--json",
      `number,title,isDraft,author,headRefName,updatedAt,url${includeChecks ? ",statusCheckRollup" : ""}`,
    ];
    const result = await executor.execute("gh", args);

    assertSuccessfulGhResult(result);

    return parseJson<PullRequestListResponse[]>(result.stdout)
      .map((response) => normalizeOpenPullRequest(response, includeChecks ? target : undefined))
      .filter((pullRequest): pullRequest is OpenPullRequest => Boolean(pullRequest))
      .sort(comparePullRequestsByUpdatedAt);
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchAuthoredOpenPullRequests(
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<AuthoredOpenPullRequest[]> {
  try {
    const result = await executor.execute("gh", [
      "search",
      "prs",
      "--author",
      "@me",
      "--state",
      "open",
      "--sort",
      "updated",
      "--order",
      "desc",
      "--limit",
      "100",
      "--json",
      "number,title,isDraft,updatedAt,url,repository",
    ]);

    assertSuccessfulGhResult(result);

    return parseJson<PullRequestSearchResponse[]>(result.stdout)
      .map(normalizeAuthoredOpenPullRequest)
      .filter((pullRequest): pullRequest is AuthoredOpenPullRequest => Boolean(pullRequest))
      .sort(comparePullRequestsByUpdatedAt);
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchPullRequestDetails(
  targets: PrWatchTarget[],
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<PullRequestDetailsBatch> {
  const batchSize = 50;
  const details: PullRequestDetailsBatch = [];

  try {
    for (let offset = 0; offset < targets.length; offset += batchSize) {
      const batch = targets.slice(offset, offset + batchSize);
      const query = createPullRequestDetailsQuery(batch);
      const result = await executor.execute("gh", query.args);

      assertSuccessfulGhResult(result);
      const response = parseJson<PullRequestDetailsQueryResponse>(result.stdout);

      details.push(
        ...batch.map((_, index) => normalizePullRequestDetails(response.data?.[`repository${index}`]?.pullRequest)),
      );
    }

    return details;
  } catch (error) {
    throw normalizeGhError(error);
  }
}
