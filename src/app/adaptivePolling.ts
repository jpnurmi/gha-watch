export const activePollIntervalMs = 30_000;
export const terminalPollIntervalMs = 5 * 60_000;

export function getAdaptivePollIntervalMs(hasActiveWatches: boolean): number {
  return hasActiveWatches ? activePollIntervalMs : terminalPollIntervalMs;
}
