export type CollapsedGroups = {
  has(repoLabel: string): boolean;
  toggle(repoLabel: string): void;
};

export function createCollapsedGroups(initialRepoLabels: string[] = []): CollapsedGroups {
  const repoLabels = new Set(initialRepoLabels);

  return {
    has(repoLabel) {
      return repoLabels.has(repoLabel);
    },

    toggle(repoLabel) {
      if (repoLabels.has(repoLabel)) {
        repoLabels.delete(repoLabel);
        return;
      }

      repoLabels.add(repoLabel);
    },
  };
}
