import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import type { DesktopNotificationActionId, WatchNotification } from "../app/watchNotification";

export type DesktopNotificationAction = {
  watchId: string;
  action: DesktopNotificationActionId;
  url?: string;
};

export type DesktopNotificationDeps = {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<NotificationPermission>;
  showNotification(notification: WatchNotification): Promise<void>;
  listenToNotificationActions?(listener: (payload: unknown) => void): Promise<() => void>;
  clearNotifications?(): Promise<void>;
};

const notificationActionEvent = "desktop-notification-action";

export class NotificationPermissionDeniedError extends Error {
  readonly code = "notification-permission-denied";

  constructor() {
    super("Desktop notification permission was denied.");
    this.name = "NotificationPermissionDeniedError";
  }
}

const desktopNotificationDeps: DesktopNotificationDeps = {
  isPermissionGranted,
  requestPermission,
  async showNotification(notification) {
    await invoke("show_desktop_notification", { notification });
  },
  async listenToNotificationActions(listener) {
    return listen<unknown>(notificationActionEvent, (event) => {
      listener(event.payload);
    });
  },
  async clearNotifications() {
    await invoke("clear_desktop_notifications");
  },
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

  if (!permissionGranted) {
    throw new NotificationPermissionDeniedError();
  }

  await deps.showNotification(notification);
}

export async function clearDesktopNotifications(
  deps: DesktopNotificationDeps = desktopNotificationDeps,
): Promise<void> {
  if (!deps.clearNotifications) {
    throw new Error("Desktop notification clearing is unavailable.");
  }
  await deps.clearNotifications();
}

export async function listenForDesktopNotificationActions(
  onAction: (action: DesktopNotificationAction) => void,
  deps: DesktopNotificationDeps = desktopNotificationDeps,
): Promise<() => void> {
  return (
    deps.listenToNotificationActions?.((payload) => {
      if (isDesktopNotificationAction(payload)) {
        onAction(payload);
      }
    }) ?? Promise.resolve(() => {})
  );
}

export function isDesktopNotificationAction(payload: unknown): payload is DesktopNotificationAction {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const action = payload as Record<string, unknown>;
  const keys = Object.keys(action);

  return keys.every((key) => key === "watchId" || key === "action" || key === "url") &&
    typeof action.watchId === "string" &&
    action.watchId.trim() === action.watchId &&
    action.watchId.length > 0 &&
    isDesktopNotificationActionId(action.action) &&
    (action.url === undefined ||
      (typeof action.url === "string" && isVerifiedGitHubNotificationUrl(action.url)));
}

export function isVerifiedGitHubNotificationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);

    return parsed.protocol === "https:" &&
      parsed.hostname === "github.com" &&
      parsed.username === "" &&
      parsed.password === "" &&
      pathParts.length >= 2;
  } catch {
    return false;
  }
}

function isDesktopNotificationActionId(action: unknown): action is DesktopNotificationActionId {
  return action === "open" ||
    action === "rerun-all" ||
    action === "rerun-failed" ||
    action === "save" ||
    action === "done";
}
