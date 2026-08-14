import { describe, expect, it } from "vitest";
import {
  emptyWorkflowDiscoveryState,
  getWorkflowDiscoverySubscriptionFingerprint,
  normalizeWorkflowDiscoveryState,
  pruneWorkflowDiscoveryState,
  setWorkflowDiscoveryCursor,
  workflowDiscoveryRecentRunLimit,
} from "./workflowDiscovery";

describe("workflow discovery state", () => {
  it("normalizes repository identities, timestamps, and recent run IDs", () => {
    const now = new Date("2026-08-12T12:00:00Z");

    expect(normalizeWorkflowDiscoveryState({
      version: 1,
      repositories: {
        "GetSentry/Sentry": {
          baselineAt: "2026-08-12T13:00:00Z",
          lastScannedAt: "2026-08-12T13:00:00Z",
          updatedAt: "invalid",
          recentRunIds: ["2", "2", "invalid", 3, "1"],
        },
        invalid: {
          lastScannedAt: "2026-08-12T10:00:00Z",
          recentRunIds: [],
        },
      },
    }, now)).toEqual({
      version: 2,
      repositories: {
        "getsentry/sentry": {
          baselineAt: now.toISOString(),
          lastScannedAt: now.toISOString(),
          updatedAt: now.toISOString(),
          recentRunIds: ["2", "1"],
        },
      },
    });
  });

  it("rejects unknown versions and malformed cursors", () => {
    expect(normalizeWorkflowDiscoveryState({ version: 3, repositories: {} })).toEqual(
      emptyWorkflowDiscoveryState,
    );
    expect(normalizeWorkflowDiscoveryState({
      version: 1,
      repositories: {
        "getsentry/sentry": { lastScannedAt: "invalid" },
      },
    })).toEqual(emptyWorkflowDiscoveryState);
  });

  it("creates deterministic fingerprints for subscription sets", () => {
    expect(getWorkflowDiscoverySubscriptionFingerprint({
      owner: "getsentry",
      repo: "sentry",
      pullRequestScope: "user",
      defaultBranchWorkflowNames: ["Lint", "CI", "CI"],
      userWorkflowNames: ["Deploy"],
    })).toBe(getWorkflowDiscoverySubscriptionFingerprint({
      owner: "getsentry",
      repo: "sentry",
      pullRequestScope: "user",
      defaultBranchWorkflowNames: ["CI", "Lint"],
      userWorkflowNames: ["Deploy"],
    }));
  });

  it("normalizes persisted subscription fingerprints", () => {
    const timestamp = "2026-08-12T10:00:00.000Z";
    const state = normalizeWorkflowDiscoveryState({
      version: 2,
      repositories: {
        "getsentry/sentry": {
          lastScannedAt: timestamp,
          recentRunIds: [],
          subscriptionFingerprint: JSON.stringify({
            pullRequestScope: "all",
            defaultBranchWorkflowNames: ["Lint", "CI", "CI"],
            userWorkflowNames: ["Deploy"],
          }),
          updatedAt: timestamp,
        },
      },
    }, new Date("2026-08-12T12:00:00Z"));

    expect(state.repositories["getsentry/sentry"].subscriptionFingerprint).toBe(
      getWorkflowDiscoverySubscriptionFingerprint({
        owner: "getsentry",
        repo: "sentry",
        pullRequestScope: "all",
        defaultBranchWorkflowNames: ["CI", "Lint"],
        userWorkflowNames: ["Deploy"],
      }),
    );
  });

  it("caps recent IDs and prunes repositories without subscriptions", () => {
    const runIds = Array.from(
      { length: workflowDiscoveryRecentRunLimit + 10 },
      (_, index) => String(index + 1),
    );
    const state = setWorkflowDiscoveryCursor(
      emptyWorkflowDiscoveryState,
      { owner: "GetSentry", repo: "Sentry" },
      new Date("2026-08-12T12:00:00Z"),
      runIds,
    );
    const withOtherRepo = {
      ...state,
      repositories: {
        ...state.repositories,
        "octo/repo": state.repositories["getsentry/sentry"],
      },
    };

    expect(state.repositories["getsentry/sentry"].recentRunIds).toHaveLength(
      workflowDiscoveryRecentRunLimit,
    );
    expect(pruneWorkflowDiscoveryState(withOtherRepo, [
      { owner: "getsentry", repo: "sentry" },
    ])).toEqual(state);
  });
});
