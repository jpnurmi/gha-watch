import { describe, expect, it } from "vitest";
import {
  getPullRequestDiscoveryId,
  getUnwatchedPullRequests,
} from "./pullRequestDiscovery";

describe("getUnwatchedPullRequests", () => {
  it("returns individual pull requests sorted by recent activity", () => {
    expect(
      getUnwatchedPullRequests(
        [
          createPullRequest("getsentry", "relay", "1", "2026-08-17T10:00:00Z"),
          createPullRequest("getsentry", "seer", "2", "2026-08-18T10:00:00Z"),
          createPullRequest("getsentry", "relay", "3", "2026-08-18T12:00:00Z"),
        ],
        [],
        [],
        [],
      ).map(getPullRequestDiscoveryId),
    ).toEqual(["getsentry/relay#3", "getsentry/seer#2", "getsentry/relay#1"]);
  });

  it("excludes watched, dismissed, duplicate, and subscription-covered pull requests", () => {
    expect(
      getUnwatchedPullRequests(
        [
          createPullRequest("getsentry", "relay", "1", "2026-08-18T12:00:00Z"),
          createPullRequest("getsentry", "relay", "2", "2026-08-18T11:00:00Z"),
          createPullRequest("getsentry", "seer", "3", "2026-08-18T10:00:00Z"),
          createPullRequest("getsentry", "seer", "3", "2026-08-18T10:00:00Z"),
          createPullRequest("getsentry", "sentry", "4", "2026-08-18T09:00:00Z"),
        ],
        [{ owner: "GetSentry", repo: "Relay", pullRequestScope: "user" }],
        ["GETSENTRY/SEER#3"],
        ["getsentry/sentry#4"],
      ),
    ).toEqual([]);
  });
});

function createPullRequest(owner: string, repo: string, number: string, updatedAt: string) {
  return {
    owner,
    repo,
    number,
    title: `Pull request ${number}`,
    isDraft: false,
    updatedAt,
    url: `https://github.com/${owner}/${repo}/pull/${number}`,
  };
}
