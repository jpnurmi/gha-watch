export class NotificationPermissionDeniedError extends Error {
  readonly code = "notification-permission-denied";

  constructor() {
    super("Desktop notification permission was denied.");
    this.name = "NotificationPermissionDeniedError";
  }
}
