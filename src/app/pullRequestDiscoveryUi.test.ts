import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { renderAddForm } from "../ui/addPanel";
const mainSource = renderAddForm({ status: "loaded", loadedAt: 0, pullRequests: [] }, [{
  owner: "owner", repo: "repo", number: "1", title: "Fix tests", isDraft: false,
  url: "https://github.com/owner/repo/pull/1",
}]);
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("pull request discovery UI", () => {
  it("opens suggested pull request titles on GitHub without submitting the add form", () => {
    expect(mainSource).toMatch(
      /class="watch-title-link add-discovery-pr-title"\s+type="button"\s+data-action="open-github-url"\s+data-url="https:\/\/github.com\/owner\/repo\/pull\/1"/,
    );
    expect(mainSource).toContain('class="watch-title-text">Fix tests');
  });

  it("uses the main view's pull request presentation", () => {
    expect(mainSource).toContain('class="add-discovery-pr-icon pr-state-icon pr-state-icon-ready"');
    expect(mainSource).toContain('class="watch-label add-discovery-label"');
    expect(mainSource).toContain('class="watch-title-reference">#1');
    expect(mainSource).toContain('class="watch-meta add-discovery-meta"');
  });

  it("reveals subtle add and dismiss actions on row interaction", () => {
    expect(mainSource).toContain('title="Add pull request"');
    expect(mainSource).toContain('>+</button>');
    expect(mainSource).toContain('>×</button>');
    expect(styles).toMatch(
      /\.add-discovery-add,\s*\.add-discovery-dismiss\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;[^}]*visibility:\s*hidden;/s,
    );
    expect(styles).toMatch(
      /\.add-discovery-item:hover :is\(\.add-discovery-add, \.add-discovery-dismiss\),/,
    );
  });

  it("keeps the discovery scrollbar outside the row action area", () => {
    expect(styles).toMatch(
      /\.add-discovery-list\s*\{[^}]*overflow:\s*auto;[^}]*margin:\s*0 -16px;[^}]*padding:\s*0 16px;/s,
    );
  });

  it("preserves the full manual-entry guidance", () => {
    expect(mainSource).toContain('placeholder="owner/repo#1234"');
    expect(mainSource).toContain("or https://github.com/OWNER/REPO/actions/runs/RUN_ID");
  });
});
