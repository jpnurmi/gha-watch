import {
  cancelAll,
  isPermissionGranted,
  removeAllActive,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { WatchNotification } from "../app/watchNotification";

type NativeNotificationOptions = NotificationOptions & {
  largeBody?: string;
  summary?: string;
  group?: string;
};

type NativeNotificationHandle = {
  onclick: ((event: Event) => void) | null;
  close(): void;
};

export type DesktopNotificationDeps = {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<NotificationPermission>;
  createNotification(title: string, options: NativeNotificationOptions): NativeNotificationHandle;
  openUrl(url: string): Promise<void>;
  setNotificationTimeout?(callback: () => void, delay: number): unknown;
  cancelAllNotifications?(): Promise<void>;
  removeAllActiveNotifications?(): Promise<void>;
};

const transientNotificationDurationMs = 5_000;
const activeNotifications = new Set<NativeNotificationHandle>();

const desktopNotificationDeps: DesktopNotificationDeps = {
  isPermissionGranted,
  requestPermission,
  createNotification(title, options) {
    return new Notification(title, options);
  },
  openUrl,
  setNotificationTimeout(callback, delay) {
    return window.setTimeout(callback, delay);
  },
  cancelAllNotifications: cancelAll,
  removeAllActiveNotifications: removeAllActive,
};

function closeNotification(notification: NativeNotificationHandle): void {
  activeNotifications.delete(notification);
  notification.close();
}

export async function sendDesktopNotification(
  notification: WatchNotification,
  deps: DesktopNotificationDeps = desktopNotificationDeps,
  onClick?: (notification: WatchNotification) => void,
): Promise<void> {
  let permissionGranted = await deps.isPermissionGranted();

  if (!permissionGranted) {
    const permission = await deps.requestPermission();
    permissionGranted = permission === "granted";
  }

  if (permissionGranted) {
    const shownNotification = deps.createNotification(notification.title, {
      body: notification.body,
      largeBody: notification.largeBody,
      summary: notification.summary,
      group: notification.group,
    });

    activeNotifications.add(shownNotification);

    shownNotification.onclick = () => {
      closeNotification(shownNotification);
      onClick?.(notification);
      void deps.openUrl(notification.url);
    };

    if (!notification.persistent) {
      deps.setNotificationTimeout?.(() => {
        closeNotification(shownNotification);
      }, transientNotificationDurationMs);
    }
  }
}

export async function clearDesktopNotifications(
  deps: DesktopNotificationDeps = desktopNotificationDeps,
): Promise<void> {
  for (const notification of Array.from(activeNotifications)) {
    closeNotification(notification);
  }

  await Promise.allSettled([
    deps.cancelAllNotifications?.(),
    deps.removeAllActiveNotifications?.(),
  ]);
}
