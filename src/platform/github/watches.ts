import { type RerunMode, type WatchSnapshot, type WatchStateFetchOptions } from "../../app/githubPort";
import { type PrWatchTarget, type WatchTarget } from "../../domain/githubUrl";
import { fetchConditionalApiJson } from "../conditionalApi";
import { assertSuccessfulGhResult, normalizeGhError, parseJson } from "../ghProtocol";
import { createTauriShellExecutor, type ShellExecutor } from "../shell";
import { getPullRequestRunIds, getRerunArgs, runJobsHaveFailures, shouldFetchRunJobs, toJobSnapshot, toPrSnapshot, toRunSnapshot } from "./normalize";
import { type JobViewResponse, type PrCheckResponse, type RunJobsResponse, type RunViewResponse } from "./responses";

export async function fetchWatchState(
  target: WatchTarget,
  executor: ShellExecutor = createTauriShellExecutor(),
  options: WatchStateFetchOptions = {},
): Promise<WatchSnapshot> {
  try {
    if (target.kind === "pr") {
      const result = await executor.execute("gh", [
        "pr",
        "checks",
        target.prNumber,
        "-R",
        `${target.owner}/${target.repo}`,
        "--json",
        "bucket,completedAt,startedAt",
      ]);

      assertSuccessfulGhResult(result, result.stdout.trim() ? [1, 8] : [8]);
      return toPrSnapshot(target, parseJson<PrCheckResponse[]>(result.stdout));
    }

    if (target.kind === "run") {
      const response = await fetchConditionalApiJson<RunViewResponse>(executor, [
        `repos/${target.owner}/${target.repo}/actions/runs/${target.runId}`,
      ], options.force);
      const failedChildren = shouldFetchRunJobs(response)
        ? await fetchRunFailedChildren(target, executor, options.force)
        : undefined;

      return toRunSnapshot(target, response, failedChildren);
    }

    const response = await fetchConditionalApiJson<JobViewResponse>(executor, [
      `repos/${target.owner}/${target.repo}/actions/jobs/${target.jobId}`,
    ], options.force);
    return toJobSnapshot(target.url, response);
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function rerunWatch(
  target: WatchTarget,
  mode: RerunMode,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<void> {
  if (target.kind === "pr") {
    await rerunPullRequestChecks(target, mode, executor);
    return;
  }

  const runId = target.runId;

  if (!runId) {
    throw new Error("This job link does not include a workflow run id.");
  }

  try {
    assertSuccessfulGhResult(
      await executor.execute("gh", getRerunArgs(runId, target, mode)),
    );
  } catch (error) {
    throw normalizeGhError(error);
  }
}

async function rerunPullRequestChecks(
  target: PrWatchTarget,
  mode: RerunMode,
  executor: ShellExecutor,
): Promise<void> {
  try {
    const result = await executor.execute("gh", [
      "pr",
      "checks",
      target.prNumber,
      "-R",
      `${target.owner}/${target.repo}`,
      "--json",
      "bucket,link",
    ]);

    assertSuccessfulGhResult(result, result.stdout.trim() ? [1, 8] : [8]);
    const runIds = getPullRequestRunIds(target, parseJson<PrCheckResponse[]>(result.stdout), mode);

    if (runIds.length === 0) {
      throw new Error(
        mode === "failed"
          ? "No failed GitHub Actions jobs were found for this pull request."
          : "No failed or cancelled GitHub Actions jobs were found for this pull request.",
      );
    }

    for (const runId of runIds) {
      assertSuccessfulGhResult(
        await executor.execute("gh", getRerunArgs(runId, target, mode)),
      );
    }
  } catch (error) {
    throw normalizeGhError(error);
  }
}

async function fetchRunFailedChildren(
  target: Extract<WatchTarget, { kind: "run" }>,
  executor: ShellExecutor,
  force = false,
): Promise<boolean> {
  const response = await fetchConditionalApiJson<RunJobsResponse>(executor, [
    `repos/${target.owner}/${target.repo}/actions/runs/${target.runId}/jobs?per_page=100`,
  ], force);
  return runJobsHaveFailures(response);
}
