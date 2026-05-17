import { describe, expect, it } from "vitest";
import { getRepoHeaderActions } from "./repoHeaderActions";

describe("getRepoHeaderActions", () => {
  it("shows open pull requests for every visible repository group", () => {
    expect(getRepoHeaderActions({ favorite: false })).toMatchObject({
      showOpenPullRequests: true,
      showActiveWorkflowRuns: true,
    });
  });

  it("keeps favorite state separate from open pull request visibility", () => {
    expect(getRepoHeaderActions({ favorite: true })).toEqual({
      favorite: true,
      showActiveWorkflowRuns: true,
      showOpenPullRequests: true,
    });
    expect(getRepoHeaderActions({ favorite: false })).toEqual({
      favorite: false,
      showActiveWorkflowRuns: true,
      showOpenPullRequests: true,
    });
  });
});
