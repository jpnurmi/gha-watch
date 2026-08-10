type Repository = {
  owner: string;
  repo: string;
};

export function createRepositoryIconProvider(
  fetchIcon: (repo: Repository) => Promise<string | undefined>,
): (repo: Repository) => Promise<string | undefined> {
  const cachedIcons = new Map<string, string | undefined>();
  const pendingIcons = new Map<string, Promise<string | undefined>>();

  return async (repo) => {
    const key = getRepositoryKey(repo);

    if (cachedIcons.has(key)) {
      return cachedIcons.get(key);
    }

    const pending = pendingIcons.get(key);

    if (pending) {
      return pending;
    }

    const request = fetchIcon(repo).then((icon) => {
      cachedIcons.set(key, icon);
      return icon;
    });
    pendingIcons.set(key, request);

    try {
      return await request;
    } finally {
      if (pendingIcons.get(key) === request) {
        pendingIcons.delete(key);
      }
    }
  };
}

function getRepositoryKey(repo: Repository): string {
  return `${repo.owner.toLowerCase()}/${repo.repo.toLowerCase()}`;
}
