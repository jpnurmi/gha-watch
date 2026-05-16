import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  cancelAll,
  isPermissionGranted,
  removeAllActive,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import type { WatchNotification } from "../app/watchNotification";

export type DesktopNotificationClick = {
  watchId: string;
  url: string;
};

export type DesktopNotificationDeps = {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<NotificationPermission>;
  showNotification(notification: WatchNotification): Promise<void>;
  listenToNotificationClicks?(listener: (payload: unknown) => void): Promise<() => void>;
  cancelAllNotifications?(): Promise<void>;
  removeAllActiveNotifications?(): Promise<void>;
};

const notificationClickEvent = "desktop-notification-clicked";

const desktopNotificationDeps: DesktopNotificationDeps = {
  isPermissionGranted,
  requestPermission,
  async showNotification(notification) {
    await invoke("show_desktop_notification", { notification });
  },
  async listenToNotificationClicks(listener) {
    return listen<unknown>(notificationClickEvent, (event) => {
      listener(event.payload);
    });
  },
  cancelAllNotifications: cancelAll,
  removeAllActiveNotifications: removeAllActive,
};

export async function sendDesktopNotification(
  notification: WatchNotification,
  deps: DesktopNotificationDeps = desktopNotificationDeps,
): Promise<void> {
  let permissionGranted = await deps.isPermissionGranted();

  if (!permissionGranted) {
    const permission = await deps.requestPermission();
    permissionGranted = permission === "granted";
  }

  if (permissionGranted) {
    await deps.showNotification(notification);
  }
}

export async function clearDesktopNotifications(
  deps: DesktopNotificationDeps = desktopNotificationDeps,
): Promise<void> {
  await Promise.allSettled([
    deps.cancelAllNotifications?.(),
    deps.removeAllActiveNotifications?.(),
  ]);
}

export async function listenForDesktopNotificationClicks(
  onClick: (click: DesktopNotificationClick) => void,
  deps: DesktopNotificationDeps = desktopNotificationDeps,
): Promise<() => void> {
  return (
    deps.listenToNotificationClicks?.((payload) => {
      if (isDesktopNotificationClick(payload)) {
        onClick(payload);
      }
    }) ?? Promise.resolve(() => {})
  );
}

function isDesktopNotificationClick(payload: unknown): payload is DesktopNotificationClick {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const click = payload as Record<string, unknown>;

  return typeof click.watchId === "string" && click.watchId.length > 0 && typeof click.url === "string";
}
