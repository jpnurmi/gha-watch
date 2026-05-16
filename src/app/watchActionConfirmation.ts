export function isWatchActionConfirmation(action: string | undefined): boolean {
  return action === "confirm-remove" || action === "confirm-rerun";
}
