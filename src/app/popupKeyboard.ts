import type { WatchTriageState } from "../domain/watches";

export type PopupEscapeLayer =
  | "drag"
  | "popover"
  | "add"
  | "popup";

export type PopupEscapeState = {
  addOpen: boolean;
  dragActive: boolean;
  popoverOpen: boolean;
};

export type ReorderDirection = "up" | "down";

export type LocalShortcutContext = {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  textEntry: boolean;
};

export function getPopupEscapeLayer(state: PopupEscapeState): PopupEscapeLayer {
  if (state.dragActive) {
    return "drag";
  }

  if (state.popoverOpen) {
    return "popover";
  }

  return state.addOpen ? "add" : "popup";
}

export function getAdjacentIndex(
  currentIndex: number,
  itemCount: number,
  direction: ReorderDirection,
  wrap: boolean,
): number {
  if (itemCount <= 0 || currentIndex < 0 || currentIndex >= itemCount) {
    return -1;
  }

  const delta = direction === "up" ? -1 : 1;
  const nextIndex = currentIndex + delta;

  if (wrap) {
    return (nextIndex + itemCount) % itemCount;
  }

  return Math.max(0, Math.min(itemCount - 1, nextIndex));
}

export function getAdjacentWatchView(
  currentView: WatchTriageState,
  direction: "left" | "right",
): WatchTriageState {
  const views: WatchTriageState[] = ["inbox", "saved", "done"];
  const currentIndex = views.indexOf(currentView);
  const nextIndex = getAdjacentIndex(
    currentIndex,
    views.length,
    direction === "left" ? "up" : "down",
    true,
  );

  return views[nextIndex] ?? currentView;
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable=\"false\"])") );
}

export function shouldHandleLocalShortcut(context: LocalShortcutContext): boolean {
  return !context.textEntry && !context.altKey && !context.ctrlKey && !context.metaKey;
}

export function getReorderTargetIndex(
  currentIndex: number,
  itemCount: number,
  direction: ReorderDirection,
): number | undefined {
  const nextIndex = getAdjacentIndex(currentIndex, itemCount, direction, false);
  return nextIndex === currentIndex || nextIndex < 0 ? undefined : nextIndex;
}

export function getReorderAnnouncement(
  label: string,
  itemKind: "repository" | "watch",
  position: number,
  itemCount: number,
): string {
  const kind = itemKind === "repository" ? "Repository" : "Watch";
  return `${kind} ${label} moved to position ${String(position)} of ${String(itemCount)}.`;
}
