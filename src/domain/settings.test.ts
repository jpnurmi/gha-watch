import { describe, expect, it } from "vitest";
import { defaultAppSettings, normalizeAppSettings } from "./settings";

describe("normalizeAppSettings", () => {
  it("includes watched repos in default settings", () => {
    expect(defaultAppSettings).toEqual({
      watchedRepos: [],
      repoOrder: [],
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
      }),
    ).toEqual({
      watchedRepos: [
        { owner: "getsentry", repo: "sentry", pullRequestScope: "user" },
        { owner: "jpnurmi", repo: "gha-watch", pullRequestScope: "all" },
      ],
      repoOrder: ["jpnurmi/gha-watch", "getsentry/sentry"],
    });
  });
});
