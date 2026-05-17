import { describe, expect, it, vi } from "vitest";
import {
  getAutoStartEnabled,
  setAutoStartEnabled,
  type AutoStartDeps,
} from "./autostart";

describe("getAutoStartEnabled", () => {
  it("reads the current OS auto-start state", async () => {
    const deps: AutoStartDeps = {
      enable: vi.fn(async () => {}),
      disable: vi.fn(async () => {}),
      isEnabled: vi.fn(async () => true),
    };

    await expect(getAutoStartEnabled(deps)).resolves.toBe(true);
  });
});

describe("setAutoStartEnabled", () => {
  it("enables OS auto-start", async () => {
    const deps: AutoStartDeps = {
      enable: vi.fn(async () => {}),
      disable: vi.fn(async () => {}),
      isEnabled: vi.fn(async () => true),
    };

    await expect(setAutoStartEnabled(true, deps)).resolves.toBe(true);

    expect(deps.enable).toHaveBeenCalledTimes(1);
    expect(deps.disable).not.toHaveBeenCalled();
    expect(deps.isEnabled).toHaveBeenCalledTimes(1);
  });

  it("disables OS auto-start", async () => {
    const deps: AutoStartDeps = {
      enable: vi.fn(async () => {}),
      disable: vi.fn(async () => {}),
      isEnabled: vi.fn(async () => false),
    };

    await expect(setAutoStartEnabled(false, deps)).resolves.toBe(false);

    expect(deps.disable).toHaveBeenCalledTimes(1);
    expect(deps.enable).not.toHaveBeenCalled();
    expect(deps.isEnabled).toHaveBeenCalledTimes(1);
  });
});
