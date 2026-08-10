export const repoReorderLongPressMs = 350;
export const repoReorderMoveTolerancePx = 6;

export function isRepoReorderLongPress(durationMs: number): boolean {
  return durationMs >= repoReorderLongPressMs;
}

export function didRepoReorderPressMove(options: {
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
}): boolean {
  return Math.abs(options.clientX - options.startX) > repoReorderMoveTolerancePx ||
    Math.abs(options.clientY - options.startY) > repoReorderMoveTolerancePx;
}
