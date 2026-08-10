import { describe, expect, it } from "vitest";
import { getRepoHeaderActions } from "./repoHeaderActions";

describe("getRepoHeaderActions", () => {
  it("shows open pull requests for every visible repository group", () => {
    expect(getRepoHeaderActions({ favorite: false, userCollapsed: false })).toMatchObject({
      showOpenPullRequests: true,
      showActiveWorkflowRuns: true,
    });
  });

  it("keeps favorite state separate from open pull request visibility", () => {
    expect(getRepoHeaderActions({ favorite: true, userCollapsed: false })).toEqual({
      favorite: true,
      isCollapsed: false,
      showActiveWorkflowRuns: true,
      showOpenPullRequests: true,
    });
    expect(getRepoHeaderActions({ favorite: false, userCollapsed: true })).toEqual({
      favorite: false,
      isCollapsed: true,
      showActiveWorkflowRuns: true,
      showOpenPullRequests: true,
    });
  });

  it("preserves the collapse preference while a repository is empty", () => {
    expect(getRepoHeaderActions({ favorite: true, userCollapsed: false }).isCollapsed).toBe(false);
    expect(getRepoHeaderActions({ favorite: true, userCollapsed: true }).isCollapsed).toBe(true);
  });
});
