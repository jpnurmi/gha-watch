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

  it("hides the popup before opening external links", () => {
    expect(mainSource).toMatch(
      /async function openExternalUrl\(url: string\): Promise<void> \{\s*await hideMainWindow\(\);\s*await invokeDesktop\("open_github_url", \{ url \}\);\s*\}/,
    );
    expect(mainSource).not.toContain("void openUrl(");
  });
});
