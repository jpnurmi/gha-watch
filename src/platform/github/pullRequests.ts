import { type AuthoredOpenPullRequest, type OpenPullRequest, type OpenPullRequestCheckOptions, type PullRequestDetailsBatch } from "../../app/githubPort";
import { type ParsedWatchTarget, type PrWatchTarget } from "../../domain/githubUrl";
import { assertSuccessfulGhResult, normalizeGhError, parseJson } from "../ghProtocol";
import { createTauriShellExecutor, type ShellExecutor } from "../shell";
import { comparePullRequestsByUpdatedAt, createPullRequestDetailsQuery, normalizeAuthoredOpenPullRequest, normalizeOpenPullRequest, normalizePullRequestDetails } from "./normalize";
import { type PullRequestDetailsQueryResponse, type PullRequestListQueryResponse, type PullRequestSearchResponse } from "./responses";
import { executeGraphql } from "./rateLimit";

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
    const fields = `number title isDraft author { login } headRefName updatedAt url
      stack { number size } stackEntry { position }
      ${includeChecks ? `commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes {
        ... on CheckRun { name status conclusion startedAt completedAt checkSuite { workflowRun { workflow { name } } } }
        ... on StatusContext { context state }
      } } } } } }` : ""}`;
    const args = author
      ? [
          "api", "graphql", "-f",
          `query=query($search: String!) { search(query: $search, type: ISSUE, first: 100) { nodes { ... on PullRequest { ${fields} } } } }`,
          "-f", `search=repo:${target.owner}/${target.repo} is:pr is:open author:${author} sort:updated-desc`,
        ]
      : [
          "api", "graphql", "-f",
          `query=query($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) {
            pullRequests(states: OPEN, first: 100, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ${fields} } }
          } }`,
          "-f", `owner=${target.owner}`, "-f", `repo=${target.repo}`,
        ];
    const result = await executeGraphql(executor, args);

    assertSuccessfulGhResult(result);

    const response = parseJson<PullRequestListQueryResponse>(result.stdout);
    const nodes = response.data?.repository?.pullRequests?.nodes ?? response.data?.search?.nodes ?? [];

    return nodes
      .map((node) => node ? normalizeOpenPullRequest(node, includeChecks ? target : undefined) : undefined)
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
      const result = await executeGraphql(executor, query.args);

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
