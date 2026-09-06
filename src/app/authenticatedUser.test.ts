import { describe, expect, it } from "vitest";
import { createAuthenticatedUserLoginProvider } from "./authenticatedUser";

describe("createAuthenticatedUserLoginProvider", () => {
  it("shares concurrent requests and caches the login", async () => {
    let fetches = 0;
    const getLogin = createAuthenticatedUserLoginProvider(async () => {
      fetches += 1;
      return "octocat";
    });

    await expect(Promise.all([getLogin(), getLogin()])).resolves.toEqual(["octocat", "octocat"]);
    await expect(getLogin()).resolves.toBe("octocat");
    expect(fetches).toBe(1);
  });

  it("retries after a failed request", async () => {
    let fetches = 0;
    const getLogin = createAuthenticatedUserLoginProvider(async () => {
      fetches += 1;

      if (fetches === 1) {
        throw new Error("Not authenticated");
      }

      return "octocat";
    });

    await expect(getLogin()).rejects.toThrow("Not authenticated");
    await expect(getLogin()).resolves.toBe("octocat");
    expect(fetches).toBe(2);
  });

  it("refreshes the account after the cache expires", async () => {
    let now = 0;
    let login = "first";
    const getLogin = createAuthenticatedUserLoginProvider(async () => login, () => now);
    expect(await getLogin()).toBe("first");
    login = "second";
    now = 60_000;
    expect(await getLogin()).toBe("second");
  });

});
