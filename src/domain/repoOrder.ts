export type RepoDropPosition = "before" | "after";

export type RepoDropCandidate = {
  key: string;
  top: number;
  height: number;
};

export type RepoDropTarget = {
  targetKey: string;
  position: RepoDropPosition;
};

const ownerPattern = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
const repoPattern = "[A-Za-z0-9._-]+";
const repoOrderKeyPattern = new RegExp(`^${ownerPattern}/${repoPattern}$`);

export function normalizeRepoOrder(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const repoOrder: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const key = typeof item === "string" ? item.trim() : "";

    if (!repoOrderKeyPattern.test(key) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    repoOrder.push(key);
  }

  return repoOrder;
}

export function moveRepoKey(
  repoOrder: string[],
  draggedKey: string,
  targetKey: string,
  position: RepoDropPosition,
): string[] {
  if (draggedKey === targetKey) {
    return repoOrder;
  }

  const draggedIndex = repoOrder.indexOf(draggedKey);
  const targetIndex = repoOrder.indexOf(targetKey);

  if (draggedIndex === -1 || targetIndex === -1) {
    return repoOrder;
  }

  const nextOrder = repoOrder.filter((key) => key !== draggedKey);
  const nextTargetIndex = nextOrder.indexOf(targetKey);

  if (nextTargetIndex === -1) {
    return repoOrder;
  }

  nextOrder.splice(position === "after" ? nextTargetIndex + 1 : nextTargetIndex, 0, draggedKey);
  return nextOrder;
}

export function getRepoDropPosition(options: {
  clientY: number;
  top: number;
  height: number;
}): RepoDropPosition {
  return options.clientY >= options.top + options.height / 2 ? "after" : "before";
}

export function getRepoDropTarget(
  candidates: RepoDropCandidate[],
  draggedKey: string,
  clientY: number,
): RepoDropTarget | undefined {
  for (const candidate of candidates) {
    if (candidate.key === draggedKey) {
      continue;
    }

    if (clientY < candidate.top || clientY > candidate.top + candidate.height) {
      continue;
    }

    return {
      targetKey: candidate.key,
      position: getRepoDropPosition({
        clientY,
        top: candidate.top,
        height: candidate.height,
      }),
    };
  }

  return undefined;
}
