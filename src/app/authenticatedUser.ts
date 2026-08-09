export function createAuthenticatedUserLoginProvider(
  fetchLogin: () => Promise<string>,
): () => Promise<string> {
  let cachedLogin: string | undefined;
  let pendingLogin: Promise<string> | undefined;

  return async () => {
    if (cachedLogin !== undefined) {
      return cachedLogin;
    }

    pendingLogin ??= fetchLogin().then((login) => {
      cachedLogin = login;
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
