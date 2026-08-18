import { describe, expect, it } from "vitest";
import { defaultAppSettings, normalizeAppSettings } from "./settings";

describe("normalizeAppSettings", () => {
  it("includes watched repos in default settings", () => {
    expect(defaultAppSettings).toEqual({
      watchedRepos: [],
      repoOrder: [],
      dismissedPullRequests: [],
    });
  });

  it("normalizes watched repos from saved settings", () => {
    expect(
      normalizeAppSettings({
        watchedRepos: [
          { owner: "getsentry", repo: "sentry", pullRequestScope: "user" },
          { owner: "getsentry", repo: "sentry", pullRequestScope: "user" },
          { owner: "jpnurmi", repo: "gha-watch", pullRequestScope: "all" },
        ],
        repoOrder: [
          "jpnurmi/gha-watch",
          "jpnurmi/gha-watch",
          "getsentry/sentry",
          "missing-owner",
        ],
        dismissedPullRequests: [
          "GetSentry/Sentry#123",
          "getsentry/sentry#123",
          "invalid",
        ],
      }),
    ).toEqual({
      watchedRepos: [
        { owner: "getsentry", repo: "sentry", pullRequestScope: "user" },
        { owner: "jpnurmi", repo: "gha-watch", pullRequestScope: "all" },
      ],
      repoOrder: ["jpnurmi/gha-watch", "getsentry/sentry"],
      dismissedPullRequests: ["getsentry/sentry#123"],
    });
  });
});
