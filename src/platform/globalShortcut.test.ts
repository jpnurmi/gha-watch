import { describe, expect, it, vi } from "vitest";
import {
  createGlobalShortcutRegistration,
  type GlobalShortcutEvent,
  type GlobalShortcutRegistrationStatus,
} from "./globalShortcut";

describe("global shortcut registration", () => {
  it("registers one pressed-state handler and unregisters cleanly", async () => {
    let handler: ((event: GlobalShortcutEvent) => void) | undefined;
    const trigger = vi.fn();
    const statuses: GlobalShortcutRegistrationStatus[] = [];
    const api = {
      register: vi.fn(async (_shortcut: string, nextHandler: (event: GlobalShortcutEvent) => void) => {
        handler = nextHandler;
      }),
      unregister: vi.fn(async () => undefined),
    };
    const registration = createGlobalShortcutRegistration(api, trigger, (status) => statuses.push(status));

    await registration.configure(true, "CommandOrControl+Shift+G");
    handler?.({ state: "Released" });
    handler?.({ state: "Pressed" });
    await registration.dispose();
    handler?.({ state: "Pressed" });

    expect(trigger).toHaveBeenCalledOnce();
    expect(api.unregister).toHaveBeenCalledOnce();
    expect(statuses).toEqual([
      { state: "registering", shortcut: "CommandOrControl+Shift+G" },
      { state: "registered", shortcut: "CommandOrControl+Shift+G" },
      { state: "disabled" },
    ]);
  });

  it("reconfigures without leaving duplicate registrations", async () => {
    const api = {
      register: vi.fn(async (_shortcut: string, _handler: (event: GlobalShortcutEvent) => void) => undefined),
      unregister: vi.fn(async (_shortcut: string) => undefined),
    };
    const registration = createGlobalShortcutRegistration(api, vi.fn(), vi.fn());

    await registration.configure(true, "CommandOrControl+Shift+G");
    await registration.configure(true, "CommandOrControl+Shift+H");
    await registration.configure(false, "CommandOrControl+Shift+H");

    expect(api.register.mock.calls.map(([shortcut]) => shortcut)).toEqual([
      "CommandOrControl+Shift+G",
      "CommandOrControl+Shift+H",
    ]);
    expect(api.unregister.mock.calls.map(([shortcut]) => shortcut)).toEqual([
      "CommandOrControl+Shift+G",
      "CommandOrControl+Shift+H",
    ]);
  });

  it("surfaces conflicts without breaking the application", async () => {
    const statuses: GlobalShortcutRegistrationStatus[] = [];
    const registration = createGlobalShortcutRegistration(
      {
        register: async () => {
          throw new Error("shortcut already registered");
        },
        unregister: async () => undefined,
      },
      vi.fn(),
      (status) => statuses.push(status),
    );

    await expect(registration.configure(true, "CommandOrControl+Shift+G")).resolves.toBeUndefined();
    expect(statuses.at(-1)).toEqual({
      state: "error",
      shortcut: "CommandOrControl+Shift+G",
      error: "shortcut already registered",
    });
  });
});
