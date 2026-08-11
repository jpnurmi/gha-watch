import { describe, expect, it } from "vitest";
import { getRepoHeaderActions } from "./repoHeaderActions";

describe("getRepoHeaderActions", () => {
  it("shows open pull requests for every visible repository group", () => {
    expect(getRepoHeaderActions({ userCollapsed: false })).toMatchObject({
      showOpenPullRequests: true,
      showActiveWorkflowRuns: true,
    });
  });

  it("keeps pull request visibility independent from collapse state", () => {
    expect(getRepoHeaderActions({ userCollapsed: false })).toEqual({
      isCollapsed: false,
      showActiveWorkflowRuns: true,
      showOpenPullRequests: true,
    });
    expect(getRepoHeaderActions({ userCollapsed: true })).toEqual({
      isCollapsed: true,
      showActiveWorkflowRuns: true,
      showOpenPullRequests: true,
    });
  });

  it("preserves the collapse preference while a repository is empty", () => {
    expect(getRepoHeaderActions({ userCollapsed: false }).isCollapsed).toBe(false);
    expect(getRepoHeaderActions({ userCollapsed: true }).isCollapsed).toBe(true);
  });
});
