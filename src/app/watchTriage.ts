import { getFavoriteRepoKey, type FavoriteRepo } from "../domain/favorites";
import type { WatchTriageState } from "../domain/watches";

export type WatchTriageAction = {
  label: string;
  state: WatchTriageState;
};

export function getWatchViewFavoriteRepos(
  favoriteRepos: FavoriteRepo[],
  watches: Array<{ target: Pick<FavoriteRepo, "owner" | "repo"> }>,
  state: WatchTriageState,
): FavoriteRepo[] {
  if (state === "inbox") {
    return favoriteRepos;
  }

  const visibleRepoKeys = new Set(watches.map((watch) => getFavoriteRepoKey(watch.target)));
  return favoriteRepos.filter((favorite) => visibleRepoKeys.has(getFavoriteRepoKey(favorite)));
}

export function getWatchTriageActions(
  currentState: WatchTriageState,
): WatchTriageAction[] {
  if (currentState === "saved") {
    return [
      { label: "Move to inbox", state: "inbox" },
      { label: "Done", state: "done" },
    ];
  }

  if (currentState === "done") {
    return [
      { label: "Move to inbox", state: "inbox" },
      { label: "Save", state: "saved" },
    ];
  }

  return [
    { label: "Save", state: "saved" },
    { label: "Done", state: "done" },
  ];
}
