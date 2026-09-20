import { canonicalWatchId } from "./identity";

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

    const id = canonicalWatchId(item.id);
    const existing = suppressions.get(id);
    if (!existing || Date.parse(item.clearedAt) > Date.parse(existing.clearedAt)) {
      suppressions.set(id, { id, clearedAt: item.clearedAt });
    }
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
      const key = canonicalWatchId(id);
      next.set(key, { id: key, clearedAt: timestamp });
    }
  }

  return [...next.values()];
}

export function removeWatchSuppression(
  suppressions: WatchSuppression[],
  id: string,
): WatchSuppression[] {
  const next = suppressions.filter((suppression) => canonicalWatchId(suppression.id) !== canonicalWatchId(id));
  return next.length === suppressions.length ? suppressions : next;
}

export function isWatchSuppressed(
  suppressions: WatchSuppression[],
  id: string,
): boolean {
  return suppressions.some((suppression) => canonicalWatchId(suppression.id) === canonicalWatchId(id));
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
