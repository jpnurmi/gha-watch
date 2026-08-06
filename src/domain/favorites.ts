export type FavoriteRepo = {
  owner: string;
  repo: string;
  repoIconUrl?: string;
  defaultBranchWorkflowNames?: string[];
  userWorkflowNames?: string[];
};

export type FavoriteWorkflowSubscriptionScope = "defaultBranch" | "user";

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

export function addFavoriteRepo(favorites: FavoriteRepo[], repo: Pick<FavoriteRepo, "owner" | "repo">): FavoriteRepo[] {
  if (isFavoriteRepo(favorites, repo)) {
    return favorites;
  }

  return [...favorites, { owner: repo.owner, repo: repo.repo }];
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

export function toggleFavoriteWorkflowSubscription(
  favorites: FavoriteRepo[],
  repo: Pick<FavoriteRepo, "owner" | "repo">,
  scope: FavoriteWorkflowSubscriptionScope,
  workflowName: string,
): FavoriteRepo[] {
  const cleanWorkflowName = normalizeWorkflowName(workflowName);

  if (!cleanWorkflowName) {
    return favorites;
  }

  const favorite = favorites.find((item) => getFavoriteRepoKey(item) === getFavoriteRepoKey(repo));
  const nextFavorite = toggleFavoriteWorkflowName(
    favorite ?? { owner: repo.owner, repo: repo.repo },
    scope,
    cleanWorkflowName,
  );

  if (!favorite) {
    return [...favorites, nextFavorite];
  }

  return favorites.map((item) => (item === favorite ? nextFavorite : item));
}

export function hasFavoriteWorkflowSubscriptions(repo: FavoriteRepo): boolean {
  return Boolean(repo.defaultBranchWorkflowNames?.length || repo.userWorkflowNames?.length);
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
  const defaultBranchWorkflowNames = normalizeWorkflowNames(record.defaultBranchWorkflowNames);
  const userWorkflowNames = normalizeWorkflowNames([
    ...normalizeWorkflowNames(record.userWorkflowNames),
    ...normalizeWorkflowNames(record.ownPullRequestWorkflowNames),
  ]);

  return {
    owner,
    repo,
    ...(repoIconUrl ? { repoIconUrl } : {}),
    ...(defaultBranchWorkflowNames.length ? { defaultBranchWorkflowNames } : {}),
    ...(userWorkflowNames.length ? { userWorkflowNames } : {}),
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

function normalizeWorkflowNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const names: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const name = normalizeWorkflowName(item);

    if (!name || seen.has(name)) {
      continue;
    }

    seen.add(name);
    names.push(name);
  }

  return names;
}

function normalizeWorkflowName(value: unknown): string | undefined {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length > 0 ? name : undefined;
}

function toggleFavoriteWorkflowName(
  favorite: FavoriteRepo,
  scope: FavoriteWorkflowSubscriptionScope,
  workflowName: string,
): FavoriteRepo {
  const key = scope === "defaultBranch" ? "defaultBranchWorkflowNames" : "userWorkflowNames";
  const currentNames = favorite[key] ?? [];
  const nextNames = currentNames.includes(workflowName)
    ? currentNames.filter((name) => name !== workflowName)
    : [...currentNames, workflowName];
  const nextFavorite = { ...favorite };

  if (nextNames.length) {
    nextFavorite[key] = nextNames;
  } else {
    delete nextFavorite[key];
  }

  return nextFavorite;
}
