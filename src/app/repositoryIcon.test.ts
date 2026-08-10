import { describe, expect, it } from "vitest";
import { createRepositoryIconProvider } from "./repositoryIcon";

describe("createRepositoryIconProvider", () => {
  it("shares concurrent requests and caches icons by repository", async () => {
    let fetches = 0;
    const getIcon = createRepositoryIconProvider(async () => {
      fetches += 1;
      return "https://example.com/icon.png";
    });

    await expect(
      Promise.all([
        getIcon({ owner: "octo", repo: "project" }),
        getIcon({ owner: "OCTO", repo: "PROJECT" }),
      ]),
    ).resolves.toEqual(["https://example.com/icon.png", "https://example.com/icon.png"]);
    await expect(getIcon({ owner: "octo", repo: "project" })).resolves.toBe("https://example.com/icon.png");
    expect(fetches).toBe(1);
  });

  it("retries after a failed request", async () => {
    let fetches = 0;
    const getIcon = createRepositoryIconProvider(async () => {
      fetches += 1;

      if (fetches === 1) {
        throw new Error("Unavailable");
      }

      return "https://example.com/icon.png";
    });

    await expect(getIcon({ owner: "octo", repo: "project" })).rejects.toThrow("Unavailable");
    await expect(getIcon({ owner: "octo", repo: "project" })).resolves.toBe("https://example.com/icon.png");
    expect(fetches).toBe(2);
  });
});
