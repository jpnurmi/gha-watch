export function createAuthenticatedUserLoginProvider(
  fetchLogin: () => Promise<string>,
  now: () => number = Date.now,
): () => Promise<string> {
  let cachedAt = 0;
  let cachedLogin: string | undefined;
  let pendingLogin: Promise<string> | undefined;

  return async () => {
    if (cachedLogin !== undefined && now() - cachedAt < 60_000) {
      return cachedLogin;
    }

    pendingLogin ??= fetchLogin().then((login) => {
      cachedLogin = login;
      cachedAt = now();
      return login;
    });
    const request = pendingLogin;

    try {
      return await request;
    } finally {
      if (pendingLogin === request) {
        pendingLogin = undefined;
      }
    }
  };
}
