import { describe, expect, it, vi } from "vitest";
import type { WatchNotification } from "../app/watchNotification";
import {
  clearDesktopNotifications,
  listenForDesktopNotificationClicks,
  sendDesktopNotification,
  type DesktopNotificationClick,
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
    const clicks: DesktopNotificationClick[] = [];
    let emitClick: ((payload: unknown) => void) | undefined;
    const unlisten = vi.fn();
    const deps: DesktopNotificationDeps = {
      async isPermissionGranted() {
        return false;
      },
      async requestPermission() {
        return "denied";
      },
      async showNotification() {},
      async listenToNotificationClicks(listener) {
        emitClick = listener;
        return unlisten;
      },
    };

    const stopListening = await listenForDesktopNotificationClicks((click) => {
      clicks.push(click);
    }, deps);

    emitClick?.({
      watchId: "jpnurmi/gha/job/456",
      url: "https://github.com/jpnurmi/gha/actions/runs/123/job/456",
    });
    stopListening();

    expect(clicks).toEqual([
      {
        watchId: "jpnurmi/gha/job/456",
        url: "https://github.com/jpnurmi/gha/actions/runs/123/job/456",
      },
    ]);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed native notification click events", async () => {
    const clicks: DesktopNotificationClick[] = [];
    let emitClick: ((payload: unknown) => void) | undefined;
    const unlisten = () => {};
    const deps: DesktopNotificationDeps = {
      async isPermissionGranted() {
        return false;
      },
      async requestPermission() {
        return "denied";
      },
      async showNotification() {},
      async listenToNotificationClicks(listener) {
        emitClick = listener;
        return unlisten;
      },
    };

    await listenForDesktopNotificationClicks((click) => {
      clicks.push(click);
    }, deps);
    emitClick?.({ watchId: "jpnurmi/gha/job/456" });

    expect(clicks).toEqual([]);
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

    const transientNotification = notification({ persistent: false });
    await sendDesktopNotification(transientNotification, deps);

    expect(shownNotifications).toEqual([transientNotification]);
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
