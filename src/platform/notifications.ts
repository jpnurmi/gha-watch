import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  type Options as TauriNotificationOptions,
} from "@tauri-apps/plugin-notification";
import type { WatchNotification } from "../app/watchNotification";

type PersistentNotificationOptions = TauriNotificationOptions & {
  requireInteraction?: boolean;
};

export async function sendDesktopNotification(notification: WatchNotification): Promise<void> {
  let permissionGranted = await isPermissionGranted();

  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === "granted";
  }

  if (permissionGranted) {
    const options: PersistentNotificationOptions = {
      title: notification.title,
      body: notification.body,
      largeBody: notification.largeBody,
      summary: notification.summary,
      group: notification.group,
      requireInteraction: notification.requireInteraction,
    };

    sendNotification(options);
  }
}
