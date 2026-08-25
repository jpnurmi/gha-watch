import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

describe("watch tree group actions", () => {
  it("does not render row-count badges in repository or tree headers", () => {
    expect(mainSource).not.toContain("watch-tree-count");
    expect(mainSource).not.toContain("watch-group-badge");
    expect(mainSource).not.toContain("watch-group-action watch-group-badge");
    expect(styles).not.toContain(".watch-tree-count");
    expect(styles).not.toMatch(/\.watch-group-action\s*\{/);
  });

  it("exposes direct triage actions on nested watch groups", () => {
    expect(mainSource).toContain("function renderWatchTreeActions(node: WatchTreeNodeViewModel): string");
    expect(mainSource).toContain("renderTriageButtons(currentWatchView, node.rowIds");
    expect(mainSource).not.toContain("confirm-remove-group");
  });

  it("renders tree groups with normal row title and metadata placement", () => {
    expect(mainSource).toContain('class="watch-tree-main"');
    expect(mainSource).toContain("renderWatchTreeMetadata(node)");
    expect(mainSource).toContain("node.referenceLabel");
    expect(mainSource).not.toContain("renderWatchTreeStatus(node)");
    expect(styles).toMatch(
      /\.watch-tree-header\s*\{[^}]*grid-template-columns:\s*var\(--tree-chevron-width\) var\(--tree-leading-width\) minmax\(0,\s*1fr\);/s,
    );
  });

  it("starts repository children one indent step closer to the repository row", () => {
    expect(mainSource).toContain("${group.items.map((item) => renderWatchGroupItem(item)).join(\"\")}");
    expect(mainSource).toContain(
      'return item.kind === "tree" ? renderWatchTreeNode(item.node, 0) : renderWatch(item.row, 0);',
    );
    expect(mainSource).toContain("const treeIndentStepPx = 26;");
    expect(mainSource).toContain('style="--tree-indent: ${depth * treeIndentStepPx}px;"');
  });

  it("gives repository headers stronger section emphasis", () => {
    expect(styles).toMatch(/\.watch-group-header\s*\{[^}]*min-height:\s*28px;/s);
    expect(styles).toMatch(/\.watch-group-header\s*\{[^}]*background:\s*rgb\(255 255 255 \/ 6%\);/s);
    expect(styles).toMatch(/\.watch-group-title\s*\{[^}]*font-size:\s*12px;[^}]*font-weight:\s*750;/s);
    expect(styles).toMatch(/\.watch-group-link\s*\{[^}]*color:\s*rgb\(238 241 245 \/ 72%\);/s);
  });

  it("uses one compact alignment grid for repository, tree, and leaf rows", () => {
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
      /\.watch-tree-header\s*\{[^}]*padding:\s*8px calc\(6px \+ var\(--scrollbar-gutter-width\)\) 8px\s*calc\(var\(--tree-left-padding\) \+ var\(--tree-indent,\s*0px\)\);/s,
    );
    expect(styles).toMatch(
      /\.watch\s*\{[^}]*padding:\s*8px calc\(6px \+ var\(--scrollbar-gutter-width\)\) 8px\s*calc\(\s*var\(--tree-left-padding\) \+ var\(--tree-chevron-width\) \+ var\(--tree-column-gap\) \+\s*var\(--watch-indent,\s*0px\)\s*\);/s,
    );
  });

  it("keeps job rows on the same vertical rhythm as PR and workflow rows", () => {
    expect(styles).toMatch(/\.watch-tree-header\s*\{[^}]*min-height:\s*52px;/s);
    expect(styles).toMatch(/\.watch\s*\{[^}]*min-height:\s*52px;/s);
    expect(styles).toMatch(/\.watch-actions\s*\{[^}]*top:\s*5px;/s);
  });

  it("keeps branch context compact without wrapping and exposes full labels", () => {
    expect(mainSource).toContain(
      '<span class="watch-title-text" title="${escapeHtml(label)}">${renderTitleMarkup(label)}</span>',
    );
    expect(mainSource).toContain("renderWatchTitleLink(row.label, row.referenceLabel, row.url, [row.id])");
    expect(mainSource).toContain("renderWatchTitleLink(node.label, node.referenceLabel, node.url, node.rowIds)");
    expect(mainSource).toContain("renderWatchMetadataContent(items, row.branchName)");
    expect(mainSource).toContain("renderWatchMetadataContent(items, node.branchName)");
    expect(mainSource).not.toContain('watch-label${row.branchName');
    expect(mainSource).not.toContain('watch-label${node.branchName');
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
    expect(styles).toMatch(/\.watch-tree-header\s*\{[^}]*background:\s*var\(--watch-row-bg\);/s);
    expect(styles).toMatch(/\.watch\s*\{[^}]*background:\s*var\(--watch-row-bg\);/s);
    expect(styles).not.toMatch(/\.watch-tree-header:hover\s*\{[^}]*--watch-row-bg:/s);
    expect(styles).not.toMatch(/\.watch:hover\s*\{[^}]*--watch-row-bg:/s);
    expect(styles).not.toMatch(/\.watch-tree-node-workflow > \.watch-tree-header\s*\{[^}]*background:/s);
    expect(styles).not.toMatch(/\.watch-tree-header:hover\s*\{[^}]*background:/s);
  });

  it("uses consistent subtle separators for every child hierarchy row", () => {
    expect(styles).toMatch(/\.watch-group\s*\{[^}]*border-bottom:/s);
    expect(styles).toMatch(
      /:is\(\.watch-group-list,\s*\.watch-tree-children\) > :is\(\.watch,\s*\.watch-tree-node\)\s*\{[^}]*border-top:\s*1px solid rgb\(255 255 255 \/ 8%\);/s,
    );
    expect(styles).not.toMatch(/\.watch-group-list \.watch \+ \.watch\s*\{[^}]*border-top:/s);
  });

  it("puts PR icons on PR groups with a separate left-side expander column", () => {
    expect(mainSource).toContain("renderWatchTreeLeadingIcon(node)");
    expect(mainSource).toContain("renderPrStateIcon(node.prState");
    expect(mainSource).not.toContain("if (row.prState)");
    expect(styles).toContain(".watch-tree-leading-slot");
    expect(mainSource).toContain("renderWatchTreeChevron(node, hasVisibleChildren, isCollapsed)");
    expect(styles).toContain(".watch-tree-chevron");
    expect(styles).toContain(".watch-tree-chevron-spacer");
    expect(styles).not.toContain(".watch-tree-leading-slot .watch-tree-chevron");
  });

  it("renders tree chevrons in a left-side column separate from group actions", () => {
    expect(mainSource).toContain("function renderWatchTreeChevron(");
    expect(mainSource).toContain("if (!hasVisibleChildren)");
    expect(mainSource).toContain('class="watch-tree-chevron-spacer"');
    expect(mainSource).toContain('class="watch-tree-chevron"');
    expect(mainSource).toContain("${renderWatchTreeChevron(node, hasVisibleChildren, isCollapsed)}");
    expect(mainSource).toContain("function renderWatchTreeActions(node: WatchTreeNodeViewModel): string");
    expect(mainSource).not.toContain("const chevron = renderWatchTreeChevron");
    expect(mainSource).not.toContain("${chevron}");
    expect(mainSource).toContain('data-action="toggle-tree-node"');
    expect(styles).toMatch(
      /\.watch-tree-chevron\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*border-radius:\s*6px;/s,
    );
    expect(styles).toMatch(
      /\.watch-group-triage-button:hover,\s*\.watch-tree-chevron:hover:not\(\[aria-disabled="true"\]\),\s*\.watch-tree-chevron:focus-visible:not\(\[aria-disabled="true"\]\)\s*\{[^}]*background:\s*rgb\(255 255 255 \/ 7%\);[^}]*color:\s*rgb\(238 241 245 \/ 78%\);/s,
    );
    expect(styles).not.toMatch(/\.watch-tree-header:hover \.watch-tree-chevron/s);
  });

  it("renders repository chevrons on the left with the same treatment as tree chevrons", () => {
    expect(mainSource).toContain("${renderRepoGroupChevron(group, isCollapsed)}");
    expect(mainSource).toContain('class="watch-tree-chevron watch-group-toggle-chevron"');
    expect(mainSource).not.toContain('class="watch-group-chevron"');
    expect(styles).not.toContain(".watch-group-chevron");
    expect(styles).toMatch(
      /\.watch-group-header\s*\{[^}]*grid-template-columns:\s*var\(--tree-chevron-width\) var\(--tree-leading-width\) minmax\(0,\s*1fr\) var\(\s*--repo-actions-width\s*\);/s,
    );
    expect(mainSource).toContain(
      "event.target.closest('.watch-group-watch, .watch-group-actions, .repo-action-menu, .watch-group-toggle-chevron, .repo-ci-status, [data-action=\"open-github-url\"]')",
    );
    expect(styles).not.toMatch(/\.watch-group-header:hover \.watch-tree-chevron/s);
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
    expect(styles).toMatch(/\.watch-list\s*\{[^}]*--repo-actions-width:\s*72px;/s);
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
    expect(mainSource).toContain("const hasVisibleChildren = node.children.length > 0 || node.rows.length > 0;");
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

  it("lets long-press reorder operate on tree groups and leaf rows", () => {
    expect(mainSource).toContain('data-reorder-key="${escapeHtml(node.id)}"');
    expect(mainSource).toContain('data-row-ids="${escapeHtml(node.rowIds.join("\\n"))}"');
    expect(mainSource).toContain('data-reorder-key="${escapeHtml(row.id)}"');
    expect(mainSource).toContain("renderWatchTreeLeadingSlot(");
    expect(mainSource).toContain("getWatchTreePressTarget");
    expect(mainSource).toContain("getWatchReorderElement");
    expect(mainSource).toContain("controller.reorderGroupWithinRepo(sourceIds, targetIds, position)");
    expect(styles).toMatch(/\.watch-tree-node\.is-row-dragging > \.watch-tree-header/s);
    expect(styles).toMatch(/\.watch-tree-node\.is-row-drop-before > \.watch-tree-header/s);
    expect(styles).toMatch(
      /\.watch-list\.is-reordering-runs \.watch-tree-node\.is-row-dragging > \.watch-tree-header \.watch-drag-glyph\s*\{[^}]*display:\s*inline-grid;/s,
    );
  });

  it("renders unseen tree indicators on the leading icon and keeps triage controls available", () => {
    expect(mainSource).toContain("renderWatchTreeLeading(node, depth, isCollapsed)");
    expect(mainSource).toContain('return `<span class="${className}" aria-hidden="true">${leadingSlot}</span>`;');
    expect(mainSource).toContain("shouldShowWatchTreeUnseenIndicator(node, isCollapsed)");
    expect(mainSource).toContain("hasVisibleUnseenDescendantIndicator(node)");
    expect(mainSource).toContain('data-action="mark-seen"');
    expect(mainSource).toContain('data-row-ids="${escapeHtml(node.rowIds.join("\\n"))}"');
    expect(styles).not.toMatch(/\.watch\.has-unseen-change \.watch-action-button/);
    expect(styles).toMatch(
      /\.watch-list\.is-reordering-runs \.watch-tree-node\.is-row-dragging > \.watch-tree-header \.unseen-dot\s*\{[^}]*display:\s*none;/s,
    );
  });

  it("keeps action tooltips short while preserving descriptive accessible labels", () => {
    expect(mainSource).toContain('title="${action.label}"');
    expect(mainSource).toContain('aria-label="Open ${escapeHtml(label)} on GitHub"');
    expect(mainSource).toContain('aria-label="Open Actions status for ${escapeHtml(link.label)}"');
  });

  it("aligns top-level group actions with row actions", () => {
    expect(styles).toMatch(
      /\.watch-tree-header\.has-actions\s*\{[^}]*grid-template-columns:\s*var\(--tree-chevron-width\) var\(--tree-leading-width\) minmax\(0,\s*1fr\) var\(\s*--tree-actions-width\s*\);/s,
    );
    expect(styles).toMatch(
      /\.watch-tree-actions\s*\{[^}]*width:\s*var\(--tree-actions-width\);[^}]*justify-content:\s*flex-end;[^}]*padding-right:\s*0;/s,
    );
    expect(styles).toMatch(/\.watch-tree-actions\s*\{[^}]*margin-top:\s*-3px;/s);
  });

  it("indents leaf rows enough to show they are children of workflow groups", () => {
    expect(mainSource).toContain("${node.rows.map((row) => renderWatch(row, depth + 1)).join(\"\")}");
    expect(mainSource).toContain('style="--watch-indent: ${depth * treeIndentStepPx}px;"');
    expect(styles).toMatch(
      /\.watch\s*\{[^}]*padding:\s*8px calc\(6px \+ var\(--scrollbar-gutter-width\)\) 8px\s*calc\(\s*var\(--tree-left-padding\) \+ var\(--tree-chevron-width\) \+ var\(--tree-column-gap\) \+\s*var\(--watch-indent,\s*0px\)\s*\);/s,
    );
    expect(styles).toMatch(/\.watch-actions\s*\{[^}]*top:\s*5px;/s);
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
    expect(mainSource).toContain("node.label, node.doneCandidate");
    expect(mainSource).toContain('row.triageState !== "done" && row.doneCandidate');
    expect(mainSource).toContain('row.deemphasized ? " is-deemphasized" : ""');
    expect(mainSource).toContain('action.state === "done" && doneCandidate ? " is-done-candidate" : ""');
    expect(styles).toMatch(
      /:is\(\.watch-group-triage-button, \.watch-tree-action-button, \.watch-action-button\)\.is-done-candidate\s*\{[^}]*background:\s*transparent;[^}]*color:\s*rgb\(238 241 245 \/ 60%\);[^}]*visibility:\s*visible;/s,
    );
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
