import { describe, expect, it } from "vitest";
import {
  addWatchedRepo,
  getWatchedRepoKey,
  getWatchedPullRequestScope,
  hasWatchedWorkflowSubscriptions,
  isWatchedRepo,
  normalizeWatchedRepos,
  toggleWatchedPullRequestScope,
  toggleWatchedWorkflowSubscription,
  updateWatchedRepoIcon,
} from "./watchedRepos";

describe("watched repository operations", () => {
  it("normalizes valid watched repositories and removes duplicates", () => {
    expect(
      normalizeWatchedRepos([
        {
          owner: "getsentry",
          repo: "sentry",
          repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
          pullRequestScope: "user",
        },
        { owner: "getsentry", repo: "sentry" },
        { owner: "legacy", repo: "favorite", pullRequests: true },
        {
          owner: "jpnurmi",
          repo: "gha-watch",
          repoIconUrl: "",
          defaultBranchWorkflowNames: ["CI", "CI", ""],
          userWorkflowNames: ["Build", "CodeQL"],
        },
        { owner: "", repo: "missing-owner" },
        { owner: "missing-repo", repo: "" },
        null,
      ]),
    ).toEqual([
      {
        owner: "getsentry",
        repo: "sentry",
        repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
        pullRequestScope: "user",
      },
      {
        owner: "jpnurmi",
        repo: "gha-watch",
        defaultBranchWorkflowNames: ["CI"],
        userWorkflowNames: ["Build", "CodeQL"],
      },
    ]);
  });

  it("toggles pull request scopes by owner and repo", () => {
    const watchedRepos = toggleWatchedPullRequestScope([], { owner: "getsentry", repo: "sentry" }, "user");

    expect(watchedRepos).toEqual([{ owner: "getsentry", repo: "sentry", pullRequestScope: "user" }]);
    expect(toggleWatchedPullRequestScope(watchedRepos, { owner: "getsentry", repo: "sentry" }, "user")).toEqual([]);
  });

  it("adds repositories without removing existing watched repositories", () => {
    const watchedRepos = [{ owner: "getsentry", repo: "sentry", pullRequestScope: "user" as const }];

    expect(addWatchedRepo(watchedRepos, { owner: "getsentry", repo: "sentry" })).toBe(watchedRepos);
    expect(addWatchedRepo(watchedRepos, { owner: "jpnurmi", repo: "gha-watch" })).toEqual([
      { owner: "getsentry", repo: "sentry", pullRequestScope: "user" },
      { owner: "jpnurmi", repo: "gha-watch", pullRequestScope: "user" },
    ]);
  });

  it("defaults added repositories to the user pull request scope", () => {
    expect(addWatchedRepo([], { owner: "getsentry", repo: "sentry" })).toEqual([
      { owner: "getsentry", repo: "sentry", pullRequestScope: "user" },
    ]);
  });

  it("checks watched repository membership using the stable repo key", () => {
    const watchedRepos = [{ owner: "getsentry", repo: "sentry", pullRequestScope: "user" as const }];

    expect(getWatchedRepoKey(watchedRepos[0])).toBe("getsentry/sentry");
    expect(isWatchedRepo(watchedRepos, { owner: "getsentry", repo: "sentry" })).toBe(true);
    expect(isWatchedRepo(watchedRepos, { owner: "jpnurmi", repo: "gha-watch" })).toBe(false);
  });

  it("stores repository icons without changing repo order", () => {
    expect(
      updateWatchedRepoIcon(
        [
          { owner: "getsentry", repo: "sentry" },
          { owner: "jpnurmi", repo: "gha-watch" },
        ],
        { owner: "jpnurmi", repo: "gha-watch" },
        "https://avatars.githubusercontent.com/u/123?v=4",
      ),
    ).toEqual([
      { owner: "getsentry", repo: "sentry" },
      {
        owner: "jpnurmi",
        repo: "gha-watch",
        repoIconUrl: "https://avatars.githubusercontent.com/u/123?v=4",
      },
    ]);
  });

  it("toggles workflow subscriptions and watches repositories when needed", () => {
    const watchedRepos = toggleWatchedWorkflowSubscription(
      [],
      { owner: "getsentry", repo: "sentry-native" },
      "defaultBranch",
      "CI",
    );

    expect(watchedRepos).toEqual([
      {
        owner: "getsentry",
        repo: "sentry-native",
        defaultBranchWorkflowNames: ["CI"],
      },
    ]);
    expect(hasWatchedWorkflowSubscriptions(watchedRepos[0])).toBe(true);
    expect(toggleWatchedWorkflowSubscription(watchedRepos, watchedRepos[0], "user", "CI")).toEqual([
      {
        owner: "getsentry",
        repo: "sentry-native",
        defaultBranchWorkflowNames: ["CI"],
        userWorkflowNames: ["CI"],
      },
    ]);
    expect(toggleWatchedWorkflowSubscription(watchedRepos, watchedRepos[0], "defaultBranch", "CI")).toEqual([]);
  });

  it("keeps pull request and workflow watches independent", () => {
    const workflowOnly = [{
      owner: "getsentry",
      repo: "sentry-native",
      defaultBranchWorkflowNames: ["CI"],
    }];
    const withPullRequests = toggleWatchedPullRequestScope(workflowOnly, workflowOnly[0], "user");

    expect(getWatchedPullRequestScope(withPullRequests[0])).toBe("user");
    expect(toggleWatchedPullRequestScope(withPullRequests, withPullRequests[0], "user")).toEqual(workflowOnly);
  });

  it("switches pull request scope while preserving workflow watches", () => {
    const watchedRepos = [{
      owner: "getsentry",
      repo: "sentry-native",
      pullRequestScope: "user" as const,
      defaultBranchWorkflowNames: ["CI"],
    }];

    expect(toggleWatchedPullRequestScope(watchedRepos, watchedRepos[0], "all")).toEqual([{
      owner: "getsentry",
      repo: "sentry-native",
      pullRequestScope: "all",
      defaultBranchWorkflowNames: ["CI"],
    }]);
  });
});
