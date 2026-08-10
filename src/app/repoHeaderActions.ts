export type RepoHeaderActionOptions = {
  favorite: boolean;
  userCollapsed: boolean;
};

export type RepoHeaderActions = {
  favorite: boolean;
  isCollapsed: boolean;
  showActiveWorkflowRuns: boolean;
  showOpenPullRequests: boolean;
};

export function getRepoHeaderActions(options: RepoHeaderActionOptions): RepoHeaderActions {
  return {
    favorite: options.favorite,
    isCollapsed: options.userCollapsed,
    showActiveWorkflowRuns: true,
    showOpenPullRequests: true,
  };
}
