import { describe, expect, it } from "vitest";
import { getRepoHeaderActions } from "./repoHeaderActions";

describe("getRepoHeaderActions", () => {
  it("shows open pull requests for every visible repository group", () => {
    expect(getRepoHeaderActions({ favorite: false, userCollapsed: false, watchCount: 1 })).toMatchObject({
      showOpenPullRequests: true,
      showActiveWorkflowRuns: true,
    });
  });

  it("keeps favorite state separate from open pull request visibility", () => {
    expect(getRepoHeaderActions({ favorite: true, userCollapsed: false, watchCount: 1 })).toEqual({
      canToggleCollapse: true,
      favorite: true,
      isCollapsed: false,
      showActiveWorkflowRuns: true,
      showOpenPullRequests: true,
    });
    expect(getRepoHeaderActions({ favorite: false, userCollapsed: true, watchCount: 1 })).toEqual({
      canToggleCollapse: true,
      favorite: false,
      isCollapsed: true,
      showActiveWorkflowRuns: true,
      showOpenPullRequests: true,
    });
  });

  it("disables and collapses repository groups that have no watches", () => {
    expect(getRepoHeaderActions({ favorite: true, userCollapsed: false, watchCount: 0 })).toMatchObject({
      canToggleCollapse: false,
      isCollapsed: true,
    });
  });
});
