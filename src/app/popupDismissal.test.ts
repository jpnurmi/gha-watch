import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dismissPopupUi } from "./popupDismissal";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

describe("dismissPopupUi", () => {
  it("closes the overflow menu before the popup is hidden", () => {
    expect(
      dismissPopupUi({
        clearMenuOpen: true,
      }),
    ).toEqual({
      clearMenuOpen: false,
    });
  });

  it("lets external link failures reject", () => {
    expect(mainSource).toMatch(
      /async function openExternalUrl\(url: string\): Promise<void> \{\s*await invokeDesktop\("open_github_url", \{ url \}\);\s*\}/,
    );
    expect(mainSource).not.toContain('void invokeDesktop("open_github_url"');
  });

  it.each(["open-github-url", "open-repo-ci-workflow"])("handles %s failures before hiding the popup", (action) => {
    const handler = mainSource.split(`'[data-action="${action}"]'`)[1]?.split("\n  });")[0];

    expect(handler).toContain(', async (event, button: HTMLButtonElement) => {');
    expect(handler).toMatch(
      /try \{\s*await openExternalUrl\(button.dataset.url\);\s*await hideMainWindow\(\);\s*\} catch \(error\) \{\s*console.error\("Could not open GitHub (?:link|workflow)\.", error\);\s*\}/,
    );
  });

  it("preserves notification open failures for retry", () => {
    expect(mainSource).toMatch(
      /async openUrl\(url\) \{\s*await openExternalUrl\(url\);\s*await hideMainWindow\(\);\s*\}/,
    );
  });
});
