

export type RunViewResponse = {
  status?: string;
  conclusion?: string | null;
  created_at?: string;
  display_title?: string;
  head_branch?: string | null;
  head_sha?: string | null;
  html_url?: string;
  jobs_url?: string;
  name?: string;
  pull_requests?: PullRequestReference[];
  run_number?: number | string;
  run_started_at?: string;
  updated_at?: string;
};

export type RunJobsResponse = {
  jobs?: RunJobResponse[];
};

type RunJobResponse = {
  conclusion?: string | null;
  status?: string;
};

export type JobViewResponse = {
  status?: string;
  conclusion?: string | null;
  completed_at?: string | null;
  created_at?: string;
  head_branch?: string | null;
  headBranch?: string | null;
  name?: string;
  started_at?: string | null;
  workflow_name?: string;
  html_url?: string;
};

export type PrCheckResponse = {
  bucket?: string;
  completedAt?: string | null;
  link?: string;
  startedAt?: string | null;
};

export type PullRequestDetailsResponse = {
  author?: {
    login?: string;
  } | null;
  headRefName?: string;
  isDraft?: boolean;
  state?: string;
  title?: string;
};

export type PullRequestDetailsQueryResponse = {
  data?: Record<
    string,
    {
      pullRequest?: PullRequestDetailsResponse | null;
    } | null
  >;
};

export type RepositoryViewResponse = {
  default_branch?: string;
  owner?: {
    avatar_url?: string;
  };
};

export type CommitViewResponse = {
  sha?: string;
};

export type CommitComparisonResponse = {
  status?: string;
};

export type UserViewResponse = {
  login?: string;
};

export type PullRequestListResponse = {
  author?: {
    login?: string;
  };
  headRefName?: string;
  isDraft?: boolean;
  number?: number | string;
  title?: string;
  updatedAt?: string;
  url?: string;
  statusCheckRollup?: PullRequestCheckResponse[];
};

export type PullRequestCheckResponse = {
  __typename?: string;
  completedAt?: string | null;
  conclusion?: string | null;
  context?: string;
  name?: string;
  startedAt?: string | null;
  state?: string;
  status?: string;
  workflowName?: string;
};

export type PullRequestSearchResponse = PullRequestListResponse & {
  repository?: {
    nameWithOwner?: string;
  };
};

export type WorkflowRunListResponse = {
  conclusion?: string | null;
  createdAt?: string;
  databaseId?: number | string;
  displayTitle?: string;
  event?: string;
  headBranch?: string | null;
  headSha?: string | null;
  number?: number | string;
  status?: string;
  updatedAt?: string;
  url?: string;
  workflowDatabaseId?: number | string;
  workflowName?: string;
};

export type WorkflowRunsApiResponse = {
  total_count?: number;
  workflow_runs?: WorkflowRunApiResponse[];
};

export type WorkflowRunApiResponse = {
  actor?: {
    login?: string;
  };
  conclusion?: string | null;
  created_at?: string;
  display_title?: string;
  event?: string;
  head_branch?: string | null;
  head_sha?: string | null;
  html_url?: string;
  id?: number | string;
  name?: string;
  pull_requests?: WorkflowRunPullRequestResponse[];
  run_number?: number | string;
  run_started_at?: string;
  status?: string;
  updated_at?: string;
  workflow_id?: number | string;
};

export type WorkflowRunPullRequestResponse = PullRequestReference & {
  author?: {
    login?: string;
  } | null;
  user?: {
    login?: string;
  } | null;
};

export type WorkflowListResponse = {
  name?: string;
  path?: string;
  state?: string;
};

export type PullRequestReference = {
  base?: {
      repo?: {
        full_name?: string;
        url?: string;
    };
  };
  number?: number | string;
};

export type RateLimitValues = {
  limit: number;
  used: number;
  remaining: number;
  reset: number;
};

export type RateLimit = RateLimitValues & {
  resource: "REST" | "GraphQL";
};

export type RateLimitResponse = {
  resources: {
    core: RateLimitValues;
    graphql: RateLimitValues;
  };
};
