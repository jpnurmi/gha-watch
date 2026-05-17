import { describe, expect, it } from "vitest";
import { defaultAppSettings, normalizeAppSettings } from "./settings";

describe("normalizeAppSettings", () => {
  it("includes favorite repos in default settings", () => {
    expect(defaultAppSettings).toEqual({
      autoClearMergedPrWatches: false,
      favoriteRepos: [],
      repoOrder: [],
    });
  });

  it("normalizes favorite repos from saved settings", () => {
    expect(
      normalizeAppSettings({
        autoClearMergedPrWatches: true,
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
      autoClearMergedPrWatches: true,
      favoriteRepos: [
        { owner: "getsentry", repo: "sentry" },
        { owner: "jpnurmi", repo: "gha-watch" },
      ],
      repoOrder: ["jpnurmi/gha-watch", "getsentry/sentry"],
    });
  });
});
