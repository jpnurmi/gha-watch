import { describe, expect, it, vi } from "vitest";
import type { WatchNotification } from "../app/watchNotification";
import {
  clearDesktopNotifications,
  isDesktopNotificationAction,
  listenForDesktopNotificationActions,
  sendDesktopNotification,
  type DesktopNotificationAction,
  type DesktopNotificationDeps,
} from "./notifications";

function notification(overrides: Partial<WatchNotification> = {}): WatchNotification {
  return {
    watchId: "jpnurmi/gha/job/456",
    title: "Linux",
    url: "https://github.com/jpnurmi/gha/actions/runs/123/job/456",
    body: "jpnurmi/gha\nSuccessful - This check was successful.",
    largeBody: "jpnurmi/gha\nSuccessful - This check was successful.",
    summary: "jpnurmi/gha",
    group: "jpnurmi/gha",
    persistent: true,
    actions: [
      { id: "dismiss", label: "Dismiss" },
    ],
    ...overrides,
  };
}

describe("sendDesktopNotification", () => {
  it("uses the native clickable notification bridge", async () => {
    const shownNotifications: WatchNotification[] = [];
    const deps: DesktopNotificationDeps = {
      async isPermissionGranted() {
        return true;
      },
      async requestPermission() {
        return "denied";
      },
      async showNotification(shownNotification) {
        shownNotifications.push(shownNotification);
      },
    };

    await sendDesktopNotification(notification(), deps);

    expect(shownNotifications).toEqual([notification()]);
  });

  it("listens for native notification click events", async () => {
    const actions: DesktopNotificationAction[] = [];
    let emitAction: ((payload: unknown) => void) | undefined;
    const unlisten = vi.fn();
    const deps: DesktopNotificationDeps = {
      async isPermissionGranted() {
        return false;
      },
      async requestPermission() {
        return "denied";
      },
      async showNotification() {},
      async listenToNotificationActions(listener) {
        emitAction = listener;
        return unlisten;
      },
    };

    const stopListening = await listenForDesktopNotificationActions((action) => {
      actions.push(action);
    }, deps);

    emitAction?.({
      watchId: "jpnurmi/gha/job/456",
      action: "open",
      url: "https://github.com/jpnurmi/gha/actions/runs/123/job/456",
    });
    stopListening();

    expect(actions).toEqual([
      {
        watchId: "jpnurmi/gha/job/456",
        action: "open",
        url: "https://github.com/jpnurmi/gha/actions/runs/123/job/456",
      },
    ]);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed native notification click events", async () => {
    const actions: DesktopNotificationAction[] = [];
    let emitAction: ((payload: unknown) => void) | undefined;
    const unlisten = () => {};
    const deps: DesktopNotificationDeps = {
      async isPermissionGranted() {
        return false;
      },
      async requestPermission() {
        return "denied";
      },
      async showNotification() {},
      async listenToNotificationActions(listener) {
        emitAction = listener;
        return unlisten;
      },
    };

    await listenForDesktopNotificationActions((action) => {
      actions.push(action);
    }, deps);
    emitAction?.({ watchId: "jpnurmi/gha/job/456", action: "archive" });
    emitAction?.({ watchId: "jpnurmi/gha/job/456", action: "open", command: "gh run rerun" });
    emitAction?.({
      watchId: "jpnurmi/gha/job/456",
      action: "open",
      url: "https://github.com.evil.example/jpnurmi/gha",
    });

    expect(actions).toEqual([]);
  });

  it("accepts only the typed action payload shape", () => {
    expect(isDesktopNotificationAction({
      watchId: "jpnurmi/gha/job/456",
      action: "dismiss",
    })).toBe(true);
    expect(isDesktopNotificationAction({
      watchId: "jpnurmi/gha/job/456",
      action: "rerun-all",
    })).toBe(true);
    expect(isDesktopNotificationAction({
      watchId: " jpnurmi/gha/job/456",
      action: "done",
    })).toBe(false);
    expect(isDesktopNotificationAction(null)).toBe(false);
  });

  it("passes transient notifications through the native bridge", async () => {
    const shownNotifications: WatchNotification[] = [];
    const deps: DesktopNotificationDeps = {
      async isPermissionGranted() {
        return true;
      },
      async requestPermission() {
        return "denied";
      },
      async showNotification(shownNotification) {
        shownNotifications.push(shownNotification);
      },
    };

    const transientNotification = notification({ persistent: false, timeoutMs: 15_000 });
    await sendDesktopNotification(transientNotification, deps);

    expect(shownNotifications).toEqual([transientNotification]);
  });

  it("reports denied notification permission distinctly", async () => {
    const deps: DesktopNotificationDeps = {
      async isPermissionGranted() {
        return false;
      },
      async requestPermission() {
        return "denied";
      },
      async showNotification() {
        throw new Error("should not be called");
      },
    };

    await expect(sendDesktopNotification(notification(), deps)).rejects.toMatchObject({
      code: "notification-permission-denied",
      message: "Desktop notification permission was denied.",
    });
  });

  it("clears delivered native notifications", async () => {
    const cancelAllNotifications = vi.fn(async () => {});
    const removeAllActiveNotifications = vi.fn(async () => {});
    const deps: DesktopNotificationDeps = {
      async isPermissionGranted() {
        return true;
      },
      async requestPermission() {
        return "denied";
      },
      async showNotification() {},
      cancelAllNotifications,
      removeAllActiveNotifications,
    };

    await sendDesktopNotification(notification(), deps);
    await sendDesktopNotification(notification({ watchId: "jpnurmi/gha/job/789" }), deps);
    await clearDesktopNotifications(deps);

    expect(cancelAllNotifications).toHaveBeenCalledTimes(1);
    expect(removeAllActiveNotifications).toHaveBeenCalledTimes(1);
  });
});
