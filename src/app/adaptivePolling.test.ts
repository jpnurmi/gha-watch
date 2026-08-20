import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activePollIntervalMs,
  createAdaptivePollingCoordinator,
  terminalPollIntervalMs,
} from "./adaptivePolling";

describe("adaptive polling coordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function createCoordinator(hasActiveWatches: () => boolean) {
    const poll = vi.fn();
    const coordinator = createAdaptivePollingCoordinator({
      clearTimeout,
      hasActiveWatches,
      poll,
      setTimeout,
    });

    return { coordinator, poll };
  }

  it("schedules active and terminal polls at their adaptive intervals", () => {
    let active = true;
    const { coordinator, poll } = createCoordinator(() => active);

    expect(coordinator.getIntervalMs()).toBe(30_000);
    coordinator.scheduleNext();
    vi.advanceTimersByTime(activePollIntervalMs - 1);
    expect(poll).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(poll).toHaveBeenCalledTimes(1);

    active = false;
    expect(coordinator.getIntervalMs()).toBe(5 * 60_000);
    coordinator.scheduleNext();
    vi.advanceTimersByTime(terminalPollIntervalMs - 1);
    expect(poll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("cancels the pending timeout when rescheduling", () => {
    let active = true;
    const { coordinator, poll } = createCoordinator(() => active);

    coordinator.scheduleNext();
    active = false;
    coordinator.scheduleNext();
    vi.advanceTimersByTime(activePollIntervalMs);
    expect(poll).not.toHaveBeenCalled();
    vi.advanceTimersByTime(terminalPollIntervalMs - activePollIntervalMs);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("polls immediately only when focus is gained", () => {
    const { coordinator, poll } = createCoordinator(() => false);

    coordinator.handleFocusChanged(false);
    expect(poll).not.toHaveBeenCalled();
    coordinator.handleFocusChanged(true);
    expect(poll).toHaveBeenCalledTimes(1);
  });
});
