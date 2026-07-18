import { describe, expect, it } from "vitest";
import { defaultAppSettings, normalizeAppSettings } from "./settings";

describe("normalizeAppSettings", () => {
  it("includes favorite repos in default settings", () => {
    expect(defaultAppSettings).toEqual({
      autoClearFinishedWatches: false,
      favoriteRepos: [],
      repoOrder: [],
    });
  });

  it("normalizes favorite repos from saved settings", () => {
    expect(
      normalizeAppSettings({
        autoClearFinishedWatches: true,
        favoriteRepos: [
          { owner: "getsentry", repo: "sentry" },
          { owner: "getsentry", repo: "sentry" },
          { owner: "jpnurmi", repo: "gha-watch" },
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
      favoriteRepos: [
        { owner: "getsentry", repo: "sentry" },
        { owner: "jpnurmi", repo: "gha-watch" },
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
