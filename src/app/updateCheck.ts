export const updateCheckIntervalMs = 24 * 60 * 60 * 1_000;
export const resumeProbeIntervalMs = 60 * 1_000;
export const resumeDelayToleranceMs = 5 * 1_000;

type Timeout = ReturnType<typeof setTimeout>;

export type UpdateCheckCoordinator = {
  checkNow(): Promise<void>;
  start(): void;
  stop(): void;
};

export type UpdateCheckDependencies = {
  clearTimeout(timeout: Timeout): void;
  fetchLatestSha(): Promise<string>;
  getBuildSha(): Promise<string>;
  now(): number;
  onAvailabilityChanged(available: boolean): void;
  reportError(error: unknown): void;
  setTimeout(callback: () => void, delay: number): Timeout;
};

export function createUpdateCheckCoordinator(
  deps: UpdateCheckDependencies,
): UpdateCheckCoordinator {
  let buildSha: Promise<string> | undefined;
  let check: Promise<void> | undefined;
  let dailyTimeout: Timeout | undefined;
  let resumeTimeout: Timeout | undefined;
  let nextResumeProbeAt = 0;
  let available = false;
  let stopped = true;

  function checkNow(): Promise<void> {
    if (check) {
      return check;
    }

    check = (async () => {
      try {
        buildSha ??= deps.getBuildSha();
        const [built, latest] = await Promise.all([buildSha, deps.fetchLatestSha()]);

        if (!isSha1(built) || !isSha1(latest)) {
          return;
        }

        const nextAvailable = built.toLowerCase() !== latest.toLowerCase();

        if (nextAvailable !== available) {
          available = nextAvailable;
          deps.onAvailabilityChanged(available);
        }
      } catch (error) {
        deps.reportError(error);
      }
    })().finally(() => {
      check = undefined;
    });

    return check;
  }

  function scheduleDailyCheck(): void {
    dailyTimeout = deps.setTimeout(() => {
      scheduleDailyCheck();
      void checkNow();
    }, updateCheckIntervalMs);
  }

  function scheduleResumeProbe(): void {
    nextResumeProbeAt = deps.now() + resumeProbeIntervalMs;
    resumeTimeout = deps.setTimeout(() => {
      const delayed = deps.now() - nextResumeProbeAt >= resumeDelayToleranceMs;

      scheduleResumeProbe();

      if (delayed) {
        void checkNow();
      }
    }, resumeProbeIntervalMs);
  }

  return {
    checkNow,
    start() {
      if (!stopped) {
        return;
      }

      stopped = false;
      void checkNow();
      scheduleDailyCheck();
      scheduleResumeProbe();
    },
    stop() {
      stopped = true;

      if (dailyTimeout !== undefined) {
        deps.clearTimeout(dailyTimeout);
        dailyTimeout = undefined;
      }

      if (resumeTimeout !== undefined) {
        deps.clearTimeout(resumeTimeout);
        resumeTimeout = undefined;
      }
    },
  };
}

function isSha1(value: string): boolean {
  return /^[a-f\d]{40}$/i.test(value);
}
