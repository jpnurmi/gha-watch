import { describe, expect, it } from "vitest";
import { defaultAppSettings, normalizeAppSettings } from "./settings";

describe("normalizeAppSettings", () => {
  it("includes favorite repos in default settings", () => {
    expect(defaultAppSettings).toEqual({
      autoClearMergedPrWatches: false,
      favoriteRepos: [],
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
      }),
    ).toEqual({
      autoClearMergedPrWatches: true,
      favoriteRepos: [
        { owner: "getsentry", repo: "sentry" },
        { owner: "jpnurmi", repo: "gha-watch" },
      ],
    });
  });
});
