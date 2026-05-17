export type FavoriteRepo = {
  owner: string;
  repo: string;
  repoIconUrl?: string;
};

const ownerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const repoPattern = /^[A-Za-z0-9._-]+$/;

export function normalizeFavoriteRepos(value: unknown): FavoriteRepo[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const favorites: FavoriteRepo[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const favorite = normalizeFavoriteRepo(item);

    if (!favorite) {
      continue;
    }

    const key = getFavoriteRepoKey(favorite);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    favorites.push(favorite);
  }

  return favorites;
}

export function toggleFavoriteRepo(favorites: FavoriteRepo[], repo: Pick<FavoriteRepo, "owner" | "repo">): FavoriteRepo[] {
  const key = getFavoriteRepoKey(repo);

  if (isFavoriteRepo(favorites, repo)) {
    return favorites.filter((favorite) => getFavoriteRepoKey(favorite) !== key);
  }

  return [...favorites, { owner: repo.owner, repo: repo.repo }];
}

export function isFavoriteRepo(favorites: FavoriteRepo[], repo: Pick<FavoriteRepo, "owner" | "repo">): boolean {
  const key = getFavoriteRepoKey(repo);
  return favorites.some((favorite) => getFavoriteRepoKey(favorite) === key);
}

export function updateFavoriteRepoIcon(
  favorites: FavoriteRepo[],
  repo: Pick<FavoriteRepo, "owner" | "repo">,
  repoIconUrl: string | undefined,
): FavoriteRepo[] {
  if (!repoIconUrl) {
    return favorites;
  }

  const key = getFavoriteRepoKey(repo);

  return favorites.map((favorite) =>
    getFavoriteRepoKey(favorite) === key ? { ...favorite, repoIconUrl } : favorite,
  );
}

export function getFavoriteRepoKey(repo: Pick<FavoriteRepo, "owner" | "repo">): string {
  return `${repo.owner}/${repo.repo}`;
}

function normalizeFavoriteRepo(value: unknown): FavoriteRepo | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const owner = normalizeGitHubOwner(record.owner);
  const repo = normalizeGitHubRepo(record.repo);

  if (!owner || !repo) {
    return undefined;
  }

  const repoIconUrl = typeof record.repoIconUrl === "string" && record.repoIconUrl.length > 0
    ? record.repoIconUrl
    : undefined;

  return {
    owner,
    repo,
    ...(repoIconUrl ? { repoIconUrl } : {}),
  };
}

function normalizeGitHubOwner(value: unknown): string | undefined {
  const owner = typeof value === "string" ? value.trim() : "";
  return ownerPattern.test(owner) ? owner : undefined;
}

function normalizeGitHubRepo(value: unknown): string | undefined {
  const repo = typeof value === "string" ? value.trim() : "";
  return repoPattern.test(repo) ? repo : undefined;
}
