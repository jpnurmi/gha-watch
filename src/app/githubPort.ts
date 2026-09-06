import type { WatchState } from "../domain/status";
import type { PrSourceState, WatchMetadata, WatchTiming } from "../domain/watches";

export type RerunMode = "all" | "failed";

export type WatchSnapshot = WatchState & {
  title: string;
  metadata?: WatchMetadata;
  prNumber?: string;
  timing?: WatchTiming;
  url: string;
};

export type WatchStateFetchOptions = {
  force?: boolean;
};

export type OpenPullRequest = {
  number: string;
  title: string;
  isDraft: boolean;
  authorLogin?: string;
  headBranch?: string;
  state?: PrSourceState;
  checkSnapshot?: WatchSnapshot;
  updatedAt?: string;
  url: string;
};

export type OpenPullRequestCheckOptions = {
  author?: "@me";
};

export type AuthoredOpenPullRequest = OpenPullRequest & {
  owner: string;
  repo: string;
};

export type PullRequestDetails = {
  authorLogin?: string;
  branchName?: string;
  state: PrSourceState;
  title: string;
};

export type PullRequestDetailsBatch = Array<PullRequestDetails | undefined>;

export type ActiveWorkflowRun = {
  runId: string;
  runNumber?: string;
  title: string;
  runTitle?: string;
  event?: string;
  workflowName?: string;
  actorLogin?: string;
  status: string;
  conclusion?: string | null;
  branchName?: string;
  commitSha?: string;
  pullRequests?: WorkflowRunPullRequest[];
  createdAt?: string;
  startedAt?: string;
  updatedAt?: string;
  url: string;
};

export type WorkflowRunSummary = ActiveWorkflowRun & {
  conclusion: string | null;
  createdAt: string;
  pullRequests: WorkflowRunPullRequest[];
};

export type WorkflowRunPullRequest = {
  number: string;
  authorLogin?: string;
};

export type RepositoryCiStatusTone = "success" | "pending" | "failure";

export type RepositoryCiStatus = {
  tone: RepositoryCiStatusTone;
  label: string;
  description: string;
  defaultBranch: string;
  workflows: RepositoryCiWorkflowStatus[];
  commitSha?: string;
  updatedAt?: string;
  url?: string;
};

export type RepositoryCiStatusOptions = {
  commitSha?: string;
  defaultBranch?: string;
};

export type RepositoryCiWorkflowStatus = {
  tone: RepositoryCiStatusTone;
  label: string;
  description: string;
  name: string;
  url: string;
  updatedAt?: string;
};

export type WorkflowDefinition = {
  name: string;
  path: string;
  state?: string;
};
