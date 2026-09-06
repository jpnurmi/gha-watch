import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

describe("watch layout", () => {
  it("does not render row-count badges in repository headers", () => {
    expect(mainSource).not.toContain("watch-group-badge");
    expect(mainSource).not.toContain("watch-group-action watch-group-badge");
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
    expect(mainSource).toContain(
      '<span class="watch-title-text" title="${escapeHtml(label)}">${renderTitleMarkup(label)}</span>',
    );
    expect(mainSource).toContain("[row.referenceLabel, row.pullRequestReferenceLabel]");
    expect(mainSource).toContain("renderWatchMetadataContent(items, row.branchName)");
    expect(mainSource).not.toContain('watch-label${row.branchName');
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
    expect(mainSource).toContain("${renderRepoGroupChevron(group, isCollapsed)}");
    expect(mainSource).not.toContain('class="watch-group-chevron"');
    expect(styles).not.toContain(".watch-group-chevron");
    expect(styles).toMatch(
      /\.watch-group-header\s*\{[^}]*grid-template-columns:\s*var\(--tree-chevron-width\) var\(--tree-leading-width\) minmax\(0,\s*1fr\) var\(\s*--repo-actions-width\s*\);/s,
    );
    expect(mainSource).toContain(
      "event.target.closest('.watch-group-watch, .watch-group-actions, .repo-action-menu, .watch-group-toggle-chevron, .repo-ci-status, [data-action=\"open-github-url\"]')",
    );
  });

  it("opens combined repository watches from the repo icon eye badge", () => {
    expect(mainSource).toContain('class="repo-action-menu watch-group-watch-menu"');
    expect(mainSource).toContain('data-action="toggle-repository-watches"');
    expect(mainSource).toContain('title="Watches"');
    expect(mainSource).toContain("renderEyeIcon(group.watched)");
    expect(mainSource).toContain('fill="${watched ? "currentColor" : "none"}"');
    expect(mainSource).toContain('data-action="toggle-watched-pull-request-scope"');
    expect(mainSource).toContain('renderPullRequestWatchScope(group, "all", "all", selectedScope)');
    expect(mainSource).toContain('renderPullRequestWatchScope(group, "user", displayLabel, selectedScope)');
    expect(mainSource).toContain('<span class="repo-action-title">Pull requests</span>');
    expect(mainSource).toContain('<span class="repo-action-title">Branches</span>');
    expect(mainSource).toContain('const displayLabel = userLogin?.trim() || "…";');
    expect(mainSource).toContain('data-action="toggle-workflow-subscription"');
    expect(mainSource).toContain('data-action="toggle-workflow-target-editor"');
    expect(mainSource).toContain('data-action="add-workflow-pattern"');
    expect(mainSource).toContain('class="add-field workflow-target-pattern-field"');
    expect(mainSource).toContain('<button class="add-form-submit" type="submit">Add</button>');
    expect(mainSource).toContain('"Include default branch"');
    expect(mainSource).toContain('"Include own branches"');
    expect(mainSource).toContain('"Include all branches"');
    expect(mainSource).toContain('"Include by pattern"');
    expect(mainSource).toContain('"Exclude by pattern"');
    expect(mainSource).toContain("renderWorkflowTargetSign(kind === \"exclude\")");
    expect(mainSource).toContain("renderWorkflowTargetAddIcon()");
    expect(mainSource).toContain("renderWorkflowTargetRemoveIcon()");
    expect(mainSource).toContain("renderWorkflowTargetCheckIcon()");
    expect(mainSource).not.toContain("workflow-target-count");
    expect(styles).not.toContain(".workflow-target-count");
    expect(mainSource).toContain('aria-label="Add branch rule"');
    expect(mainSource).toContain('aria-label="Remove ${escapeHtml(label)}"');
    expect(mainSource).not.toContain('aria-label="Add branch target"');
    expect(mainSource).not.toContain('target to watch workflows');
    expect(mainSource).not.toContain("watch-group-subscribe-button");
    expect(mainSource).not.toContain("renderStarIcon");
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
    expect(mainSource).toContain('data-scope="${scope}"');
    expect(mainSource).not.toContain("repository-pull-request-button");
  });

  it("opens repository slugs without making repository backgrounds interactive", () => {
    expect(mainSource).toContain('class="watch-group-link"');
    expect(mainSource).toContain('data-url="${escapeHtml(getRepositoryUrl(group))}"');
    expect(mainSource).not.toContain('header.addEventListener("click"');
    expect(styles).not.toMatch(/\.watch-group-header:hover\s*\{[^}]*background:/s);
    expect(styles).not.toMatch(/\.watch-group-link\s*\{[^}]*text-decoration:/s);
    expect(styles).toMatch(
      /\.watch-group-link:hover,[^{]*\.watch-group-link:focus-visible\s*\{[^}]*color:\s*rgb\(238 241 245 \/ 92%\);/s,
    );
    expect(styles).not.toMatch(/\.watch-group-title\s*\{[^}]*color:/s);
  });

  it("renders repository triage controls and hides repo quick actions until hover", () => {
    expect(mainSource).toContain("renderRepoGroupActions(group, actions)");
    expect(mainSource).toContain('"watch-group-triage-button"');
    expect(mainSource).not.toContain('data-action="arm-remove-repo"');
    expect(mainSource).not.toContain('data-action="confirm-remove-repo"');
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
    expect(mainSource).toContain('data-action="toggle-repo-ci-status"');
    expect(mainSource).toContain("renderRepoCiStatusPopover(group.ciStatus)");
    expect(mainSource).toContain("status.workflows.map(renderRepoCiStatusItem)");
    expect(mainSource).toContain('data-action="open-repo-ci-workflow"');
    expect(mainSource).toContain('data-url="${escapeHtml(workflow.url)}"');
    expect(mainSource).toContain("void openExternalUrl(button.dataset.url)");
    expect(mainSource).toContain("workflows: status.workflows.map((workflow) => ({");
    expect(styles).toMatch(/\.repo-ci-status\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*border-radius:\s*6px;/s);
    expect(styles).toContain(".repo-ci-popover");
    expect(styles).toContain(".repo-ci-item");
    expect(styles).toMatch(/\.repo-ci-popover\s*\{[^}]*width:\s*max-content;[^}]*max-width:\s*min\(220px,\s*calc\(100vw - 32px\)\);/s);
    expect(styles).toMatch(/\.repo-ci-item\s*\{[^}]*grid-template-columns:\s*18px minmax\(0,\s*1fr\);/s);
    expect(styles).toMatch(/button\.repo-ci-status\s*\{[^}]*cursor:\s*pointer;/s);
    expect(mainSource).not.toContain("repo-ci-item-label");
  });

  it("opens explicit titles and statuses without making row backgrounds clickable", () => {
    expect(mainSource).toContain('class="watch-title-cluster watch-title-link"');
    expect(mainSource).toContain('data-action="open-github-url"');
    expect(mainSource).toContain('title="Open Actions status"');
    expect(mainSource).toContain('class="watch-main"');
    expect(mainSource).not.toContain("openWatchRow(row, event)");
    expect(mainSource).not.toContain('row.addEventListener("click"');
    expect(mainSource).not.toContain('row.addEventListener("keydown"');
    expect(mainSource).not.toContain("renderOpenLinkButton");
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

  it("keeps action tooltips short while preserving descriptive accessible labels", () => {
    expect(mainSource).toContain('title="${action.label}"');
    expect(mainSource).toContain('aria-label="Open ${escapeHtml(label)} on GitHub"');
    expect(mainSource).toContain('aria-label="Open Actions status for ${escapeHtml(link.label)}"');
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
    expect(mainSource).toContain(
      "actions.isCollapsed && group.rows.length > 0 && group.rows.every((row) => row.doneCandidate)",
    );
    expect(mainSource).toContain('row.triageState !== "done" && row.doneCandidate');
    expect(mainSource).toContain('row.deemphasized ? " is-deemphasized" : ""');
    expect(mainSource).toContain('action.state === "done" && doneCandidate ? " is-done-candidate" : ""');
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
