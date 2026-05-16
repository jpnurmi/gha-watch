import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { WatchNotification } from "../app/watchController";

export async function sendDesktopNotification(notification: WatchNotification): Promise<void> {
  let permissionGranted = await isPermissionGranted();

  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === "granted";
  }

  if (permissionGranted) {
    sendNotification({
      title: notification.title,
      body: notification.body,
    });
  }
}
