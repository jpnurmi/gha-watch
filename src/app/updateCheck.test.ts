import { describe, expect, it, vi } from "vitest";
import {
  createUpdateCheckCoordinator,
  resumeProbeIntervalMs,
  updateCheckIntervalMs,
} from "./updateCheck";

const builtSha = "1111111111111111111111111111111111111111";
const latestSha = "2222222222222222222222222222222222222222";

function createCoordinator() {
  let now = 1_000;
  const timeouts: Array<{ callback: () => void; delay: number }> = [];
  const fetchLatestSha = vi.fn(async () => latestSha);
  const onAvailabilityChanged = vi.fn();
  const reportError = vi.fn();
  const coordinator = createUpdateCheckCoordinator({
    clearTimeout: vi.fn(),
    fetchLatestSha,
    getBuildSha: vi.fn(async () => builtSha),
    isAncestor: vi.fn(async () => true),
    now: () => now,
    onAvailabilityChanged,
    reportError,
    setTimeout(callback, delay) {
      timeouts.push({ callback, delay });
      return timeouts.length as ReturnType<typeof setTimeout>;
    },
  });

  return {
    coordinator,
    fetchLatestSha,
    onAvailabilityChanged,
    reportError,
    setNow(value: number) {
      now = value;
    },
    timeouts,
  };
}

describe("update check coordinator", () => {
  it("checks on startup and reports a newer repository SHA", async () => {
    const { coordinator, fetchLatestSha, onAvailabilityChanged, timeouts } = createCoordinator();

    coordinator.start();
    await coordinator.checkNow();

    expect(fetchLatestSha).toHaveBeenCalledTimes(1);
    expect(onAvailabilityChanged).toHaveBeenCalledWith(true);
    expect(timeouts.map(({ delay }) => delay)).toEqual([
      updateCheckIntervalMs,
      resumeProbeIntervalMs,
    ]);
  });

  it("leaves the indicator clear when the build is current", async () => {
    const onAvailabilityChanged = vi.fn();
    const coordinator = createUpdateCheckCoordinator({
      clearTimeout: vi.fn(),
      fetchLatestSha: vi.fn(async () => builtSha),
      getBuildSha: vi.fn(async () => builtSha),
      isAncestor: vi.fn(async () => true),
      now: () => 0,
      onAvailabilityChanged,
      reportError: vi.fn(),
      setTimeout: vi.fn(() => 1 as ReturnType<typeof setTimeout>),
    });

    await coordinator.checkNow();

    expect(onAvailabilityChanged).not.toHaveBeenCalled();
  });

  it("leaves the indicator clear when the build is ahead of the repository", async () => {
    const onAvailabilityChanged = vi.fn();
    const isAncestor = vi.fn(async () => false);
    const coordinator = createUpdateCheckCoordinator({
      clearTimeout: vi.fn(),
      fetchLatestSha: vi.fn(async () => latestSha),
      getBuildSha: vi.fn(async () => builtSha),
      isAncestor,
      now: () => 0,
      onAvailabilityChanged,
      reportError: vi.fn(),
      setTimeout: vi.fn(() => 1 as ReturnType<typeof setTimeout>),
    });

    await coordinator.checkNow();

    expect(isAncestor).toHaveBeenCalledWith(builtSha, latestSha);
    expect(onAvailabilityChanged).not.toHaveBeenCalled();
  });

  it("checks again each day", async () => {
    const { coordinator, fetchLatestSha, timeouts } = createCoordinator();
    coordinator.start();
    await coordinator.checkNow();

    timeouts.find(({ delay }) => delay === updateCheckIntervalMs)?.callback();
    await coordinator.checkNow();

    expect(fetchLatestSha).toHaveBeenCalledTimes(2);
  });

  it("checks after a delayed timer signals a system wake", async () => {
    const { coordinator, fetchLatestSha, setNow, timeouts } = createCoordinator();
    coordinator.start();
    await coordinator.checkNow();

    setNow(1_000 + resumeProbeIntervalMs + 5_001);
    timeouts.find(({ delay }) => delay === resumeProbeIntervalMs)?.callback();
    await coordinator.checkNow();

    expect(fetchLatestSha).toHaveBeenCalledTimes(2);
  });

  it("keeps the current indicator when a check fails", async () => {
    const reportError = vi.fn();
    const onAvailabilityChanged = vi.fn();
    const coordinator = createUpdateCheckCoordinator({
      clearTimeout: vi.fn(),
      fetchLatestSha: vi.fn().mockRejectedValue(new Error("offline")),
      getBuildSha: vi.fn(async () => builtSha),
      isAncestor: vi.fn(async () => true),
      now: () => 0,
      onAvailabilityChanged,
      reportError,
      setTimeout: vi.fn(() => 1 as ReturnType<typeof setTimeout>),
    });

    await coordinator.checkNow();

    expect(onAvailabilityChanged).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
  });

  it("ignores builds without an embedded SHA", async () => {
    const onAvailabilityChanged = vi.fn();
    const coordinator = createUpdateCheckCoordinator({
      clearTimeout: vi.fn(),
      fetchLatestSha: vi.fn(async () => latestSha),
      getBuildSha: vi.fn(async () => "unknown"),
      isAncestor: vi.fn(async () => true),
      now: () => 0,
      onAvailabilityChanged,
      reportError: vi.fn(),
      setTimeout: vi.fn(() => 1 as ReturnType<typeof setTimeout>),
    });

    await coordinator.checkNow();

    expect(onAvailabilityChanged).not.toHaveBeenCalled();
  });
});
