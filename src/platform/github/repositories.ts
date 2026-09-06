import { type RepositoryCiStatus, type RepositoryCiStatusOptions } from "../../app/githubPort";
import { type ParsedWatchTarget } from "../../domain/githubUrl";
import { fetchConditionalApiJson } from "../conditionalApi";
import { assertSuccessfulGhResult, normalizeGhError, parseJson, requiredString } from "../ghProtocol";
import { createTauriShellExecutor, type ShellExecutor } from "../shell";
import { normalizeRepositoryCiWorkflowRun, summarizeRepositoryCiStatus } from "./normalize";
import { type CommitComparisonResponse, type CommitViewResponse, type RepositoryViewResponse, type WorkflowRunsApiResponse } from "./responses";

export async function fetchRepositoryIconUrl(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<string | undefined> {
  try {
    const result = await executor.execute("gh", ["api", `repos/${target.owner}/${target.repo}`]);

    assertSuccessfulGhResult(result);
    return parseJson<RepositoryViewResponse>(result.stdout).owner?.avatar_url;
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchRepositoryDefaultBranch(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<string> {
  try {
    const result = await executor.execute("gh", ["api", `repos/${target.owner}/${target.repo}`]);

    assertSuccessfulGhResult(result);
    return requiredString(parseJson<RepositoryViewResponse>(result.stdout).default_branch, "repository default branch");
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchRepositoryCommitSha(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  ref: string,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<string> {
  try {
    const commit = await fetchConditionalApiJson<CommitViewResponse>(executor, [
      `repos/${target.owner}/${target.repo}/commits/${encodeURIComponent(ref)}`,
    ]);

    return requiredString(commit.sha, "repository commit");
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function isRepositoryCommitAncestor(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  ancestorSha: string,
  descendantSha: string,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<boolean> {
  try {
    const comparison = await fetchConditionalApiJson<CommitComparisonResponse>(executor, [
      `repos/${target.owner}/${target.repo}/compare/${ancestorSha}...${descendantSha}`,
    ]);
    const status = comparison.status?.trim().toLowerCase();

    return status === "ahead" || status === "identical";
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchRepositoryDefaultBranchCiStatus(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  options: RepositoryCiStatusOptions = {},
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<RepositoryCiStatus> {
  try {
    const defaultBranch = options.defaultBranch ?? await fetchRepositoryDefaultBranch(target, executor);
    const commitSha = options.commitSha ?? await fetchRepositoryCommitSha(target, defaultBranch, executor);
    const response = await fetchConditionalApiJson<WorkflowRunsApiResponse>(executor, [
      `repos/${target.owner}/${target.repo}/actions/runs`,
      "--method",
      "GET",
      "-f",
      `branch=${defaultBranch}`,
      "-f",
      `head_sha=${commitSha}`,
      "-f",
      "event=push",
      "-F",
      "per_page=100",
    ]);
    const runs = Array.isArray(response.workflow_runs)
      ? response.workflow_runs.map(normalizeRepositoryCiWorkflowRun)
      : [];

    return summarizeRepositoryCiStatus(defaultBranch, commitSha, runs);
  } catch (error) {
    throw normalizeGhError(error);
  }
}
