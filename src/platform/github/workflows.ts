import { type ActiveWorkflowRun, type WorkflowDefinition, type WorkflowRunSummary } from "../../app/githubPort";
import { type ParsedWatchTarget } from "../../domain/githubUrl";
import { assertSuccessfulGhResult, normalizeGhError, parseJson } from "../ghProtocol";
import { createTauriShellExecutor, type ShellExecutor } from "../shell";
import { compareWorkflowDefinitionsByName, compareWorkflowRunsByUpdatedAt, dedupeWorkflowDefinitionNames, normalizeActiveWorkflowRun, normalizeWorkflowDefinition, normalizeWorkflowRunSummary, workflowRunsPerPage } from "./normalize";
import { type WorkflowListResponse, type WorkflowRunListResponse, type WorkflowRunsApiResponse } from "./responses";

export async function fetchWorkflowDefinitions(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<WorkflowDefinition[]> {
  try {
    const result = await executor.execute("gh", [
      "workflow",
      "list",
      "-R",
      `${target.owner}/${target.repo}`,
      "--limit",
      "100",
      "--json",
      "name,path,state",
    ]);

    assertSuccessfulGhResult(result);

    return parseJson<WorkflowListResponse[]>(result.stdout)
      .map(normalizeWorkflowDefinition)
      .filter((workflow): workflow is WorkflowDefinition => Boolean(workflow))
      .filter(dedupeWorkflowDefinitionNames())
      .sort(compareWorkflowDefinitionsByName);
  } catch (error) {
    throw normalizeGhError(error);
  }
}

export async function fetchActiveWorkflowRuns(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<ActiveWorkflowRun[]> {
  return fetchActiveWorkflowRunsWithArgs(target, [], executor);
}

export async function fetchUserActiveWorkflowRuns(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  userLogin: string,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<ActiveWorkflowRun[]> {
  const cleanUserLogin = userLogin.trim();

  if (!cleanUserLogin) {
    throw new Error("User workflow subscriptions need an authenticated GitHub user.");
  }

  return fetchActiveWorkflowRunsWithArgs(
    target,
    ["--user", cleanUserLogin],
    executor,
    (run) => run.event === "workflow_dispatch",
  );
}

export const activeWorkflowRunLimit = 100;

export const workflowRunCatchUpPageLimit = 10;

export async function fetchWorkflowRunsSince(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  createdAfter: string,
  createdBefore: string,
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<WorkflowRunSummary[]> {
  const runs = new Map<string, WorkflowRunSummary>();

  try {
    for (let page = 1; page <= workflowRunCatchUpPageLimit; page += 1) {
      const result = await executor.execute("gh", [
        "api",
        `repos/${target.owner}/${target.repo}/actions/runs`,
        "--method",
        "GET",
        "-f",
        `created=${createdAfter}..${createdBefore}`,
        "-F",
        `per_page=${workflowRunsPerPage}`,
        "-F",
        `page=${page}`,
      ]);

      assertSuccessfulGhResult(result);
      const response = parseJson<WorkflowRunsApiResponse>(result.stdout);
      const pageRuns = Array.isArray(response.workflow_runs) ? response.workflow_runs : [];

      for (const responseRun of pageRuns) {
        const run = normalizeWorkflowRunSummary(responseRun, target);

        if (run) {
          runs.set(run.runId, run);
        }
      }

      const totalCount = typeof response.total_count === "number" && response.total_count >= 0
        ? response.total_count
        : undefined;
      const coveredBoundary = pageRuns.length < workflowRunsPerPage ||
        (totalCount !== undefined && page * workflowRunsPerPage >= totalCount);

      if (coveredBoundary) {
        return [...runs.values()];
      }
    }

    throw new Error(
      `Workflow run catch-up exceeded the ${workflowRunCatchUpPageLimit * workflowRunsPerPage}-run scan limit.`,
    );
  } catch (error) {
    throw normalizeGhError(error);
  }
}

async function fetchActiveWorkflowRunsWithArgs(
  target: Pick<ParsedWatchTarget, "owner" | "repo">,
  extraArgs: string[],
  executor: ShellExecutor,
  includeRun: (run: WorkflowRunListResponse) => boolean = () => true,
): Promise<ActiveWorkflowRun[]> {
  try {
    const results = await Promise.all(
      ["queued", "in_progress"].map(async (status) => {
        const result = await executor.execute("gh", [
          "run",
          "list",
          "-R",
          `${target.owner}/${target.repo}`,
          "--status",
          status,
          "--limit",
          String(activeWorkflowRunLimit),
          ...extraArgs,
          "--json",
          "databaseId,number,displayTitle,event,workflowName,headBranch,status,createdAt,updatedAt,url",
        ]);

        assertSuccessfulGhResult(result);
        return parseJson<WorkflowRunListResponse[]>(result.stdout);
      }),
    );

    return results
      .flat()
      .filter(includeRun)
      .map(normalizeActiveWorkflowRun)
      .filter((run): run is ActiveWorkflowRun => Boolean(run))
      .sort(compareWorkflowRunsByUpdatedAt);
  } catch (error) {
    throw normalizeGhError(error);
  }
}
