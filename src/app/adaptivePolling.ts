export const activePollIntervalMs = 30_000;
export const terminalPollIntervalMs = 5 * 60_000;

function getAdaptivePollIntervalMs(hasActiveWatches: boolean): number {
  return hasActiveWatches ? activePollIntervalMs : terminalPollIntervalMs;
}

type AdaptivePollingDeps<Timeout> = {
  clearTimeout(timeout: Timeout): void;
  hasActiveWatches(): boolean;
  poll(): void;
  setTimeout(callback: () => void, delay: number): Timeout;
};

export type AdaptivePollingCoordinator = {
  getIntervalMs(): number;
  handleFocusChanged(focused: boolean): void;
  scheduleNext(): void;
};

export function createAdaptivePollingCoordinator<Timeout>(
  deps: AdaptivePollingDeps<Timeout>,
): AdaptivePollingCoordinator {
  let timeout: Timeout | undefined;

  function getIntervalMs(): number {
    return getAdaptivePollIntervalMs(deps.hasActiveWatches());
  }

  function scheduleNext(): void {
    if (timeout !== undefined) {
      deps.clearTimeout(timeout);
    }

    timeout = deps.setTimeout(() => {
      timeout = undefined;
      deps.poll();
    }, getIntervalMs());
  }

  return {
    getIntervalMs,
    handleFocusChanged(focused) {
      if (focused) {
        deps.poll();
      }
    },
    scheduleNext,
  };
}
