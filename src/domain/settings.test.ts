import { describe, expect, it } from "vitest";
import { defaultAppSettings, normalizeAppSettings } from "./settings";

describe("normalizeAppSettings", () => {
  it("includes watched repos in default settings", () => {
    expect(defaultAppSettings).toEqual({
      autoClearFinishedWatches: false,
      watchedRepos: [],
      repoOrder: [],
    });
  });

  it("normalizes watched repos from saved settings", () => {
    expect(
      normalizeAppSettings({
        autoClearFinishedWatches: true,
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
      autoClearFinishedWatches: true,
      watchedRepos: [
        { owner: "getsentry", repo: "sentry", pullRequestScope: "user" },
        { owner: "jpnurmi", repo: "gha-watch", pullRequestScope: "all" },
      ],
      repoOrder: ["jpnurmi/gha-watch", "getsentry/sentry"],
    });
  });

  it("keeps reading the old auto-clear setting key", () => {
    expect(
      normalizeAppSettings({
        autoClearMergedPrWatches: true,
      }),
    ).toMatchObject({
      autoClearFinishedWatches: true,
    });
  });
});
