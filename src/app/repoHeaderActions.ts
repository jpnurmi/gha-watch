export type RepoHeaderActionOptions = {
  userCollapsed: boolean;
};

export type RepoHeaderActions = {
  isCollapsed: boolean;
  showActiveWorkflowRuns: boolean;
  showOpenPullRequests: boolean;
};

export function getRepoHeaderActions(options: RepoHeaderActionOptions): RepoHeaderActions {
  return {
    isCollapsed: options.userCollapsed,
    showActiveWorkflowRuns: true,
    showOpenPullRequests: true,
  };
}
