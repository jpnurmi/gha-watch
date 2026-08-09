export type FreshnessState = {
  label: string;
  stale: boolean;
};

type FreshnessOptions = {
  isRefreshing: boolean;
  lastRefreshFailed: boolean;
  lastUpdatedAt?: number;
  now: number;
  staleAfterMs: number;
};

export function getFreshnessState(options: FreshnessOptions): FreshnessState {
  const { isRefreshing, lastRefreshFailed, lastUpdatedAt, now, staleAfterMs } = options;

  if (lastUpdatedAt === undefined) {
    return {
      label: isRefreshing ? "Updating\u2026" : "Not updated",
      stale: lastRefreshFailed || !isRefreshing,
    };
  }

  const elapsedMs = Math.max(0, now - lastUpdatedAt);

  return {
    label: formatUpdatedAgo(elapsedMs),
    stale: lastRefreshFailed || elapsedMs >= staleAfterMs,
  };
}

function formatUpdatedAgo(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000);

  if (seconds < 10) {
    return "0s ago";
  }

  if (seconds < 60) {
    return `${String(seconds)}s ago`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${String(minutes)}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${String(hours)}h ago`;
  }

  return `${String(Math.floor(hours / 24))}d ago`;
}
