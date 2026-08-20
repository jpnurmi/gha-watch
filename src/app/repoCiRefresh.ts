import type { RepoCiStatusViewModel } from "./viewModel";

export const repoCiRefreshIntervalMs = 120_000;
export const repoCiTerminalWorkflowRefreshIntervalMs = 10 * 60_000;

export function getRepoCiStatusAfterRefreshError(
  previousStatus: RepoCiStatusViewModel | undefined,
): RepoCiStatusViewModel | undefined {
  return previousStatus;
}

export function shouldRefreshRepoCiStatus(options: {
  force: boolean;
  lastUpdatedAt?: number;
  now: number;
  popupOpen: boolean;
}): boolean {
  if (options.force) {
    return true;
  }

  if (!options.popupOpen) {
    return false;
  }

  return options.lastUpdatedAt === undefined ||
    options.now - options.lastUpdatedAt >= repoCiRefreshIntervalMs;
}

export function shouldRefreshRepoCiWorkflows(options: {
  commitSha: string;
  force: boolean;
  lastUpdatedAt?: number;
  now: number;
  previousStatus?: RepoCiStatusViewModel;
}): boolean {
  if (
    options.force ||
    !options.previousStatus ||
    options.previousStatus.commitSha !== options.commitSha ||
    options.previousStatus.tone === "pending"
  ) {
    return true;
  }

  return options.lastUpdatedAt === undefined ||
    options.now - options.lastUpdatedAt >= repoCiTerminalWorkflowRefreshIntervalMs;
}
