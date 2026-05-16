import { describe, expect, it, vi } from "vitest";
import type { WatchNotification } from "../app/watchNotification";
import { sendDesktopNotification, type DesktopNotificationDeps } from "./notifications";

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
  it("opens the watched GitHub URL when the notification is clicked", async () => {
    const openedUrls: string[] = [];
    let click: (() => void) | undefined;
    const deps: DesktopNotificationDeps = {
      async isPermissionGranted() {
        return true;
      },
      async requestPermission() {
        return "denied";
      },
      createNotification(_title, _options) {
        return {
          set onclick(handler: ((event: Event) => void) | null) {
            click = typeof handler === "function" ? () => handler(new Event("click")) : undefined;
          },
          close: vi.fn(),
        };
      },
      async openUrl(url) {
        openedUrls.push(url);
      },
    };

    await sendDesktopNotification(notification(), deps);
    click?.();

    expect(openedUrls).toEqual(["https://github.com/jpnurmi/gha/actions/runs/123/job/456"]);
  });

  it("runs a click callback with the clicked watch before opening GitHub", async () => {
    const clickedWatchIds: string[] = [];
    const openedUrls: string[] = [];
    let click: (() => void) | undefined;
    const deps: DesktopNotificationDeps = {
      async isPermissionGranted() {
        return true;
      },
      async requestPermission() {
        return "denied";
      },
      createNotification(_title, _options) {
        return {
          set onclick(handler: ((event: Event) => void) | null) {
            click = typeof handler === "function" ? () => handler(new Event("click")) : undefined;
          },
          close: vi.fn(),
        };
      },
      async openUrl(url) {
        openedUrls.push(url);
      },
    };

    await sendDesktopNotification(notification(), deps, (clickedNotification) => {
      clickedWatchIds.push(clickedNotification.watchId);
    });
    click?.();

    expect(clickedWatchIds).toEqual(["jpnurmi/gha/job/456"]);
    expect(openedUrls).toEqual(["https://github.com/jpnurmi/gha/actions/runs/123/job/456"]);
  });

  it("auto-closes transient native notifications", async () => {
    let scheduledDelay = 0;
    let scheduledClose: (() => void) | undefined;
    const close = vi.fn();
    const deps: DesktopNotificationDeps = {
      async isPermissionGranted() {
        return true;
      },
      async requestPermission() {
        return "denied";
      },
      createNotification() {
        return {
          onclick: null,
          close,
        };
      },
      async openUrl() {},
      setNotificationTimeout(callback, delay) {
        scheduledDelay = delay;
        scheduledClose = callback;
        return 1;
      },
    };

    await sendDesktopNotification(notification({ persistent: false }), deps);
    scheduledClose?.();

    expect(scheduledDelay).toBe(5_000);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
