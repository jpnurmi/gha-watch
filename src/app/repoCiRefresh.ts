import type { RepoCiStatusViewModel } from "./viewModel";

export const repoCiRefreshIntervalMs = 120_000;

export function getRepoCiStatusAfterRefreshError(
  previousStatus: RepoCiStatusViewModel | undefined,
  error: unknown,
): RepoCiStatusViewModel {
  return previousStatus ?? {
    tone: "pending",
    label: "Unknown",
    description: error instanceof Error ? error.message : String(error),
    workflows: [],
  };
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
