import { isWatchRetentionExpired } from "./watches";

export type WatchSuppression = {
  id: string;
  clearedAt: string;
};

export function normalizeWatchSuppressions(value: unknown): WatchSuppression[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const suppressions = new Map<string, WatchSuppression>();

  for (const item of value) {
    if (!isWatchSuppression(item)) {
      continue;
    }

    suppressions.set(item.id, item);
  }

  return [...suppressions.values()];
}

export function addWatchSuppressions(
  suppressions: WatchSuppression[],
  ids: string[],
  clearedAt = new Date(),
): WatchSuppression[] {
  const next = new Map(suppressions.map((suppression) => [suppression.id, suppression]));
  const timestamp = clearedAt.toISOString();

  for (const id of ids) {
    if (id) {
      next.set(id, { id, clearedAt: timestamp });
    }
  }

  return [...next.values()];
}

export function removeWatchSuppression(
  suppressions: WatchSuppression[],
  id: string,
): WatchSuppression[] {
  const next = suppressions.filter((suppression) => suppression.id !== id);
  return next.length === suppressions.length ? suppressions : next;
}

export function clearExpiredWatchSuppressions(
  suppressions: WatchSuppression[],
  now = new Date(),
): WatchSuppression[] {
  const next = suppressions.filter(
    (suppression) => !isWatchRetentionExpired(suppression.clearedAt, now),
  );
  return next.length === suppressions.length ? suppressions : next;
}

export function isWatchSuppressed(
  suppressions: WatchSuppression[],
  id: string,
): boolean {
  return suppressions.some((suppression) => suppression.id === id);
}

function isWatchSuppression(value: unknown): value is WatchSuppression {
  if (!value || typeof value !== "object") {
    return false;
  }

  const suppression = value as Partial<WatchSuppression>;
  return typeof suppression.id === "string" &&
    suppression.id.length > 0 &&
    typeof suppression.clearedAt === "string" &&
    !Number.isNaN(Date.parse(suppression.clearedAt));
}
