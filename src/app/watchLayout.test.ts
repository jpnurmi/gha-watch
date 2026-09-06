import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("watch layout", () => {
  it("does not render row-count badges in repository headers", () => {
    expect(styles).not.toMatch(/\.watch-group-action\s*\{/);
  });

  it("gives repository headers stronger section emphasis", () => {
    expect(styles).toMatch(/\.watch-group-header\s*\{[^}]*min-height:\s*28px;/s);
    expect(styles).toMatch(/\.watch-group-header\s*\{[^}]*background:\s*rgb\(255 255 255 \/ 6%\);/s);
    expect(styles).toMatch(/\.watch-group-title\s*\{[^}]*font-size:\s*12px;[^}]*font-weight:\s*750;/s);
    expect(styles).toMatch(/\.watch-group-link\s*\{[^}]*color:\s*rgb\(238 241 245 \/ 72%\);/s);
  });

  it("uses one compact alignment grid for repository and watch rows", () => {
    expect(styles).toMatch(/\.watch-list\s*\{[^}]*--tree-left-padding:\s*6px;/s);
    expect(styles).toMatch(/\.watch-list\s*\{[^}]*--tree-chevron-width:\s*10px;/s);
    expect(styles).toMatch(/\.watch-list\s*\{[^}]*--tree-column-gap:\s*4px;/s);
    expect(styles).toMatch(
      /\.watch-group-header\s*\{[^}]*grid-template-columns:\s*var\(--tree-chevron-width\) var\(--tree-leading-width\) minmax\(0,\s*1fr\) var\(\s*--repo-actions-width\s*\);/s,
    );
    expect(styles).toMatch(
      /\.watch-group-header\s*\{[^}]*padding:\s*4px calc\(6px \+ var\(--scrollbar-gutter-width\)\) 4px var\(--tree-left-padding\);/s,
    );
    expect(styles).toMatch(
      /\.watch\s*\{[^}]*padding:\s*8px calc\(6px \+ var\(--scrollbar-gutter-width\)\) 8px\s*calc\(\s*var\(--tree-left-padding\) \+ var\(--tree-chevron-width\) \+ var\(--tree-column-gap\) \+\s*var\(--watch-indent,\s*0px\)\s*\);/s,
    );
  });

  it("keeps job rows on the same vertical rhythm as PR and workflow rows", () => {
    expect(styles).toMatch(/\.watch\s*\{[^}]*min-height:\s*52px;/s);
    expect(styles).toMatch(/\.watch-actions\s*\{[^}]*top:\s*5px;/s);
  });

  it("keeps branch context compact without wrapping and exposes full labels", () => {
    expect(styles).toMatch(
      /\.watch-meta\.has-branch-badge\s*\{[^}]*position:\s*relative;/s,
    );
    expect(styles).not.toMatch(/\.watch-meta\.has-branch-badge\s*\{[^}]*flex-wrap:/s);
    expect(styles).toMatch(
      /\.watch-meta \.watch-branch-badge\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*max-content;[^}]*flex:\s*1 0 56px;[^}]*margin-left:\s*auto;/s,
    );
    expect(styles).toMatch(
      /\.watch-meta \.watch-branch-badge:hover\s*\{[^}]*position:\s*absolute;[^}]*right:\s*0;[^}]*max-width:\s*100%;/s,
    );
  });

  it("uses the same base background for PR, workflow, and job rows", () => {
    expect(styles).toMatch(/\.watch\s*\{[^}]*background:\s*var\(--watch-row-bg\);/s);
    expect(styles).not.toMatch(/\.watch:hover\s*\{[^}]*--watch-row-bg:/s);
  });

  it("renders repository chevrons on the left in a separate column", () => {
    expect(styles).not.toContain(".watch-group-chevron");
    expect(styles).toMatch(
      /\.watch-group-header\s*\{[^}]*grid-template-columns:\s*var\(--tree-chevron-width\) var\(--tree-leading-width\) minmax\(0,\s*1fr\) var\(\s*--repo-actions-width\s*\);/s,
    );
  });

  it("opens combined repository watches from the repo icon eye badge", () => {
    expect(styles).not.toContain(".workflow-target-count");
    expect(styles).toMatch(
      /\.watch-group-watch\.is-watched \.watch-group-watch-glyph\s*\{[^}]*color:\s*#58a6ff;/s,
    );
    expect(styles).toMatch(/\.repository-watch-segmented\s*\{[^}]*height:\s*20px;/s);
    expect(styles).toMatch(/\.workflow-target-list\s*\{/s);
    expect(styles).toMatch(/\.workflow-target-remove\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s);
    expect(styles).toMatch(/\.workflow-target-select\s*\{[^}]*display:\s*flex;/s);
    expect(styles).toMatch(/\.workflow-target-label\s*\{[^}]*flex:\s*0 1 auto;/s);
    expect(styles).toMatch(/\.workflow-target-remove\s*\{[^}]*opacity:\s*0;[^}]*visibility:\s*hidden;/s);
    expect(styles).toMatch(/\.workflow-target-row:hover \.workflow-target-remove,[^{]*\.workflow-target-row:focus-within \.workflow-target-remove\s*\{[^}]*visibility:\s*visible;/s);
    expect(styles).not.toMatch(/\.workflow-target-remove\s*\{[^}]*border-left:/s);
  });

  it("opens repository slugs without making repository backgrounds interactive", () => {
    expect(styles).not.toMatch(/\.watch-group-header:hover\s*\{[^}]*background:/s);
    expect(styles).not.toMatch(/\.watch-group-link\s*\{[^}]*text-decoration:/s);
    expect(styles).toMatch(
      /\.watch-group-link:hover,[^{]*\.watch-group-link:focus-visible\s*\{[^}]*color:\s*rgb\(238 241 245 \/ 92%\);/s,
    );
    expect(styles).not.toMatch(/\.watch-group-title\s*\{[^}]*color:/s);
  });

  it("renders repository triage controls and hides repo quick actions until hover", () => {
    expect(styles).toMatch(/\.watch-list\s*\{[^}]*--repo-actions-width:\s*120px;/s);
    expect(styles).toMatch(
      /\.watch-group-watch,[^{]*\.watch-group-workflow-button,[^{]*\.watch-group-pr-button,[^{]*\.watch-group-triage-button\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*flex:\s*0 0 auto;/s,
    );
    expect(styles).toMatch(
      /\.watch-group-workflow-button,[^{]*\.watch-group-pr-button,[^{]*\.watch-group-triage-button\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;[^}]*visibility:\s*hidden;/s,
    );
    expect(styles).toMatch(
      /\.watch-group-header:hover \.watch-group-workflow-button,[^{]*\.watch-group-header:hover \.watch-group-pr-button,[^{]*\.watch-group-header:hover \.watch-group-triage-button/s,
    );
  });

  it("renders repository CI status as a workflow status menu", () => {
    expect(styles).toMatch(/\.repo-ci-status\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*border-radius:\s*6px;/s);
    expect(styles).toContain(".repo-ci-popover");
    expect(styles).toContain(".repo-ci-item");
    expect(styles).toMatch(/\.repo-ci-popover\s*\{[^}]*width:\s*max-content;[^}]*max-width:\s*min\(220px,\s*calc\(100vw - 32px\)\);/s);
    expect(styles).toMatch(/\.repo-ci-item\s*\{[^}]*grid-template-columns:\s*18px minmax\(0,\s*1fr\);/s);
    expect(styles).toMatch(/button\.repo-ci-status\s*\{[^}]*cursor:\s*pointer;/s);
  });

  it("opens explicit titles and statuses without making row backgrounds clickable", () => {
    expect(styles).toMatch(
      /\.watch-title-link:hover \.watch-title-text,[^{]*\.watch-title-link:focus-visible \.watch-title-text\s*\{[^}]*color:\s*#58a6ff;/s,
    );
    expect(styles).not.toMatch(
      /\.watch-title-link:hover \.watch-title-text,[^{]*\.watch-title-link:focus-visible \.watch-title-text\s*\{[^}]*text-decoration:/s,
    );
    expect(styles).toMatch(/\.watch-list\s*\{[^}]*--tree-actions-width:\s*63px;/s);
    expect(styles).toMatch(
      /\.watch \.watch-action-button\s*\{[^}]*visibility:\s*hidden;[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.watch:hover \.watch-action-button,[^{]*\.watch:focus-within \.watch-action-button/s,
    );
    expect(styles).not.toContain("open-link-button");
  });

  it("only reveals row actions for the hovered or focused row", () => {
    expect(styles).toMatch(
      /\.watch \.watch-action-button\s*\{[^}]*visibility:\s*hidden;[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.watch:hover \.watch-action-button,[^{]*\.watch:focus-within \.watch-action-button,[^{]*\.watch-action-button\[aria-expanded="true"\]\s*\{[^}]*visibility:\s*visible;[^}]*opacity:\s*0\.6;[^}]*pointer-events:\s*auto;/s,
    );
    expect(styles).not.toMatch(/\.watch\.has-unseen-change \.watch-action-button/);
  });

  it("keeps suggested Done actions visible without duplicating them in expanded repository headers", () => {
    expect(styles).toMatch(
      /\.is-done-candidate:hover,[^{]*\.is-done-candidate:focus-visible\s*\{[^}]*background:\s*rgb\(255 255 255 \/ 7%\);[^}]*opacity:\s*0\.72;/s,
    );
    expect(styles).toMatch(
      /\.watch:hover \.watch-action-button\.is-done-candidate,[^{]*\.watch:focus-within \.watch-action-button\.is-done-candidate\s*\{[^}]*opacity:\s*0\.72;/s,
    );
    expect(styles).toMatch(
      /\.watch\.has-done-candidate \.watch-title-text,\s*\.watch\.is-deemphasized \.watch-title-text\s*\{[^}]*opacity:\s*0\.55;/s,
    );
    expect(styles).toMatch(
      /\.watch\.is-deemphasized \.watch-title-text\s*\{[^}]*font-style:\s*italic;/s,
    );
    expect(styles).toMatch(
      /\.watch\.has-done-candidate \.watch-title-text\s*\{[^}]*text-decoration:\s*line-through;[^}]*text-decoration-thickness:\s*1px;/s,
    );
    expect(styles).toMatch(
      /\.watch\.has-done-candidate :is\(\.watch-workflow-status\.status-icon-success, \.watch-workflow-status\.status-icon-failure\),\s*\.watch\.is-deemphasized :is\(\.watch-workflow-status\.status-icon-success, \.watch-workflow-status\.status-icon-failure\)\s*\{[^}]*color:\s*#8b949e;/s,
    );
    expect(styles).toMatch(/\.watch\.has-done-candidate \.watch-actions::before/);
  });

  it("uses the same neutral treatment for every triage action", () => {
    expect(styles).toMatch(
      /\.rerun-button,\s*\.watch-triage-button\s*\{[^}]*color:\s*rgb\(238 241 245 \/ 60%\);/s,
    );
    expect(styles).toMatch(/\.watch-triage-button\s*\{[^}]*color:\s*rgb\(238 241 245 \/ 60%\);/s);
    expect(styles).not.toContain(".watch-triage-button.is-inbox");
    expect(styles).not.toContain(".watch-triage-button.is-saved");
    expect(styles).not.toContain(".watch-triage-button.is-done");
  });
});
