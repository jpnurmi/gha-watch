import { describe, expect, it } from "vitest";
import {
  addFavoriteRepo,
  getFavoriteRepoKey,
  isFavoriteRepo,
  normalizeFavoriteRepos,
  toggleFavoriteRepo,
  updateFavoriteRepoIcon,
} from "./favorites";

describe("favorite repo operations", () => {
  it("normalizes valid favorite repos and removes duplicates", () => {
    expect(
      normalizeFavoriteRepos([
        { owner: "getsentry", repo: "sentry", repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4" },
        { owner: "getsentry", repo: "sentry" },
        { owner: "jpnurmi", repo: "gha-watch", repoIconUrl: "" },
        { owner: "", repo: "missing-owner" },
        { owner: "missing-repo", repo: "" },
        null,
      ]),
    ).toEqual([
      {
        owner: "getsentry",
        repo: "sentry",
        repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
      },
      {
        owner: "jpnurmi",
        repo: "gha-watch",
      },
    ]);
  });

  it("toggles favorite repos by owner and repo", () => {
    const favorites = toggleFavoriteRepo([], { owner: "getsentry", repo: "sentry" });

    expect(favorites).toEqual([{ owner: "getsentry", repo: "sentry" }]);
    expect(toggleFavoriteRepo(favorites, { owner: "getsentry", repo: "sentry" })).toEqual([]);
  });

  it("adds favorite repos without removing existing favorites", () => {
    const favorites = [{ owner: "getsentry", repo: "sentry" }];

    expect(addFavoriteRepo(favorites, { owner: "getsentry", repo: "sentry" })).toBe(favorites);
    expect(addFavoriteRepo(favorites, { owner: "jpnurmi", repo: "gha-watch" })).toEqual([
      { owner: "getsentry", repo: "sentry" },
      { owner: "jpnurmi", repo: "gha-watch" },
    ]);
  });

  it("checks favorite membership using the stable repo key", () => {
    const favorites = [{ owner: "getsentry", repo: "sentry" }];

    expect(getFavoriteRepoKey(favorites[0])).toBe("getsentry/sentry");
    expect(isFavoriteRepo(favorites, { owner: "getsentry", repo: "sentry" })).toBe(true);
    expect(isFavoriteRepo(favorites, { owner: "jpnurmi", repo: "gha-watch" })).toBe(false);
  });

  it("stores repository icons without changing repo order", () => {
    expect(
      updateFavoriteRepoIcon(
        [
          { owner: "getsentry", repo: "sentry" },
          { owner: "jpnurmi", repo: "gha-watch" },
        ],
        { owner: "jpnurmi", repo: "gha-watch" },
        "https://avatars.githubusercontent.com/u/123?v=4",
      ),
    ).toEqual([
      { owner: "getsentry", repo: "sentry" },
      {
        owner: "jpnurmi",
        repo: "gha-watch",
        repoIconUrl: "https://avatars.githubusercontent.com/u/123?v=4",
      },
    ]);
  });
});
