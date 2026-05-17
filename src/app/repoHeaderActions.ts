export type RepoHeaderActionOptions = {
  favorite: boolean;
  userCollapsed: boolean;
  watchCount: number;
};

export type RepoHeaderActions = {
  canToggleCollapse: boolean;
  favorite: boolean;
  isCollapsed: boolean;
  showActiveWorkflowRuns: boolean;
  showOpenPullRequests: boolean;
};

export function getRepoHeaderActions(options: RepoHeaderActionOptions): RepoHeaderActions {
  const canToggleCollapse = options.watchCount > 0;

  return {
    canToggleCollapse,
    favorite: options.favorite,
    isCollapsed: canToggleCollapse ? options.userCollapsed : true,
    showActiveWorkflowRuns: true,
    showOpenPullRequests: true,
  };
}
