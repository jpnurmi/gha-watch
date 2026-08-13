import {
  getWatchTriageState,
  hasUnseenStatusChange,
  type WatchRecord,
  type WatchTriageState,
} from "../domain/watches";

export type WatchViewCount = {
  total: number;
  unseen: number;
};

export type WatchViewCounts = Record<WatchTriageState, WatchViewCount>;

export const watchViewCountVisualLimit = 99;

const watchViewLabels: Record<WatchTriageState, string> = {
  inbox: "Inbox",
  saved: "Saved",
  done: "Done",
};

export function getWatchViewCounts(watches: readonly WatchRecord[]): WatchViewCounts {
  const counts: WatchViewCounts = {
    inbox: { total: 0, unseen: 0 },
    saved: { total: 0, unseen: 0 },
    done: { total: 0, unseen: 0 },
  };

  for (const watch of watches) {
    const count = counts[getWatchTriageState(watch)];
    count.total += 1;

    if (hasUnseenStatusChange(watch)) {
      count.unseen += 1;
    }
  }

  return counts;
}

export function formatWatchViewCount(count: number): string {
  return count > watchViewCountVisualLimit
    ? `${String(watchViewCountVisualLimit)}+`
    : String(count);
}

export function getWatchViewAriaLabel(
  state: WatchTriageState,
  count: WatchViewCount,
): string {
  const total = `${String(count.total)} ${count.total === 1 ? "item" : "items"}`;

  if (state === "inbox") {
    return `${watchViewLabels[state]}, ${total}, ${String(count.unseen)} unseen`;
  }

  return `${watchViewLabels[state]}, ${total}`;
}
