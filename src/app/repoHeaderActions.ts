export type RepoHeaderActionOptions = {
  favorite: boolean;
};

export type RepoHeaderActions = {
  favorite: boolean;
  showActiveWorkflowRuns: boolean;
  showOpenPullRequests: boolean;
};

export function getRepoHeaderActions(options: RepoHeaderActionOptions): RepoHeaderActions {
  return {
    favorite: options.favorite,
    showActiveWorkflowRuns: true,
    showOpenPullRequests: true,
  };
}
