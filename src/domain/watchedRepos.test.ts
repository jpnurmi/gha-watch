import { describe, expect, it } from "vitest";
import {
  addWatchedRepo,
  addWatchedWorkflowSubscription,
  getWatchedPullRequestScope,
  getWatchedRepoKey,
  getWorkflowSubscriptionId,
  getWorkflowSubscriptions,
  hasWatchedWorkflowSubscriptions,
  isValidExactBranchName,
  isWatchedRepo,
  normalizeWatchedRepos,
  normalizeWorkflowSubscriptions,
  removeWatchedWorkflowSubscription,
  toggleWatchedPullRequestScope,
  updateWatchedRepoIcon,
  updateWatchedWorkflowSubscription,
  workflowRunMatchesSubscription,
  type WorkflowSubscription,
} from "./watchedRepos";

const defaultSubscription: WorkflowSubscription = {
  workflowName: "CI",
  branch: { kind: "default" },
  events: ["*"],
  actor: "any",
};

describe("watched repository operations", () => {
  it("normalizes repositories and migrates both legacy workflow scopes", () => {
    expect(normalizeWatchedRepos([
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
        defaultBranchWorkflowNames: ["CI", "CI", ""],
        userWorkflowNames: ["Build", "CodeQL"],
      },
      { owner: "", repo: "missing-owner" },
      null,
    ])).toEqual([
      {
        owner: "getsentry",
        repo: "sentry",
        repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
        pullRequestScope: "user",
      },
      {
        owner: "jpnurmi",
        repo: "gha-watch",
        workflowSubscriptions: [
          {
            workflowName: "Build",
            branch: { kind: "any" },
            events: ["workflow_dispatch"],
            actor: "currentUser",
          },
          {
            workflowName: "CI",
            branch: { kind: "default" },
            events: ["*"],
            actor: "any",
          },
          {
            workflowName: "CodeQL",
            branch: { kind: "any" },
            events: ["workflow_dispatch"],
            actor: "currentUser",
          },
        ],
      },
    ]);
  });

  it("normalizes subscription values, removes duplicates, and sorts deterministically", () => {
    expect(normalizeWorkflowSubscriptions([
      {
        workflowName: " Deploy ",
        branch: { kind: "exact", name: " release/1.x " },
        events: ["schedule", "PUSH", "schedule"],
        actor: "any",
      },
      defaultSubscription,
      defaultSubscription,
      { ...defaultSubscription, events: [] },
      { ...defaultSubscription, branch: { kind: "exact", name: "bad..branch" } },
    ])).toEqual([
      defaultSubscription,
      {
        workflowName: "Deploy",
        branch: { kind: "exact", name: "release/1.x" },
        events: ["push", "schedule"],
        actor: "any",
      },
    ]);
  });

  it("adds, updates, and removes multiple subscriptions for one workflow", () => {
    const exactSubscription: WorkflowSubscription = {
      workflowName: "CI",
      branch: { kind: "exact", name: "release/1.x" },
      events: ["push"],
      actor: "any",
    };
    let watchedRepos = addWatchedWorkflowSubscription(
      [],
      { owner: "getsentry", repo: "sentry-native" },
      defaultSubscription,
    );
    watchedRepos = addWatchedWorkflowSubscription(watchedRepos, watchedRepos[0], exactSubscription);

    expect(getWorkflowSubscriptions(watchedRepos[0])).toEqual([defaultSubscription, exactSubscription]);
    expect(hasWatchedWorkflowSubscriptions(watchedRepos[0])).toBe(true);

    watchedRepos = updateWatchedWorkflowSubscription(
      watchedRepos,
      watchedRepos[0],
      getWorkflowSubscriptionId(exactSubscription),
      { ...exactSubscription, events: ["push", "schedule"] },
    );
    expect(getWorkflowSubscriptions(watchedRepos[0])[1].events).toEqual(["push", "schedule"]);

    watchedRepos = removeWatchedWorkflowSubscription(
      watchedRepos,
      watchedRepos[0],
      getWorkflowSubscriptionId(defaultSubscription),
    );
    expect(getWorkflowSubscriptions(watchedRepos[0])).toHaveLength(1);
    watchedRepos = removeWatchedWorkflowSubscription(
      watchedRepos,
      watchedRepos[0],
      getWorkflowSubscriptionId(getWorkflowSubscriptions(watchedRepos[0])[0]),
    );
    expect(watchedRepos).toEqual([]);
  });

  it("matches exact, default, and any branches plus event and actor filters", () => {
    const run = {
      workflowName: "CI",
      branchName: "release/1.x",
      event: "push",
      actorLogin: "JPNURMI",
    };
    const context = { defaultBranch: "main", currentUserLogin: "jpnurmi" };

    expect(workflowRunMatchesSubscription(run, {
      ...defaultSubscription,
      branch: { kind: "exact", name: "release/1.x" },
      events: ["push", "schedule"],
      actor: "currentUser",
    }, context)).toBe(true);
    expect(workflowRunMatchesSubscription(run, defaultSubscription, context)).toBe(false);
    expect(workflowRunMatchesSubscription(run, {
      ...defaultSubscription,
      branch: { kind: "any" },
    }, context)).toBe(true);
    expect(workflowRunMatchesSubscription(run, {
      ...defaultSubscription,
      branch: { kind: "any" },
      events: ["schedule"],
    }, context)).toBe(false);
    expect(workflowRunMatchesSubscription(run, {
      ...defaultSubscription,
      branch: { kind: "any" },
      actor: "currentUser",
    }, { ...context, currentUserLogin: "octocat" })).toBe(false);
  });

  it("validates exact branch entries conservatively", () => {
    expect(isValidExactBranchName("release/1.x")).toBe(true);
    expect(isValidExactBranchName(" feature ")).toBe(true);
    expect(isValidExactBranchName("bad branch")).toBe(false);
    expect(isValidExactBranchName("bad..branch")).toBe(false);
    expect(isValidExactBranchName("refs/heads/main.lock")).toBe(false);
  });

  it("keeps pull request and workflow watches independent", () => {
    const workflowOnly = addWatchedWorkflowSubscription(
      [],
      { owner: "getsentry", repo: "sentry-native" },
      defaultSubscription,
    );
    const withPullRequests = toggleWatchedPullRequestScope(workflowOnly, workflowOnly[0], "user");

    expect(getWatchedPullRequestScope(withPullRequests[0])).toBe("user");
    expect(toggleWatchedPullRequestScope(withPullRequests, withPullRequests[0], "user")).toEqual(workflowOnly);
  });

  it("supports stable repository membership, adding, scopes, and icon updates", () => {
    let watchedRepos = addWatchedRepo([], { owner: "getsentry", repo: "sentry" });
    expect(watchedRepos).toEqual([{ owner: "getsentry", repo: "sentry", pullRequestScope: "user" }]);
    expect(addWatchedRepo(watchedRepos, watchedRepos[0])).toBe(watchedRepos);
    expect(getWatchedRepoKey(watchedRepos[0])).toBe("getsentry/sentry");
    expect(isWatchedRepo(watchedRepos, watchedRepos[0])).toBe(true);

    watchedRepos = toggleWatchedPullRequestScope(watchedRepos, watchedRepos[0], "all");
    watchedRepos = updateWatchedRepoIcon(watchedRepos, watchedRepos[0], "https://avatars.example/sentry.png");
    expect(watchedRepos[0]).toMatchObject({
      pullRequestScope: "all",
      repoIconUrl: "https://avatars.example/sentry.png",
    });
  });
});
