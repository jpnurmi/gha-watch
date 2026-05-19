import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canRemoveWatchTreeNode,
  getWatchTreeNodeRemoveMode,
  shouldDismissPendingTreeActionOnHeaderLeave,
} from "./watchTreeActions";

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

  it("allows nested workflow groups to expose close controls", () => {
    expect(canRemoveWatchTreeNode({ rowIds: ["getsentry/sentry/run/123"] }, 1)).toBe(true);
  });

  it("hides nested PR workflows instead of removing the whole PR source", () => {
    expect(getWatchTreeNodeRemoveMode({ kind: "workflow" }, 1)).toBe("ignore-pr-workflow");
    expect(getWatchTreeNodeRemoveMode({ kind: "pull-request" }, 0)).toBe("remove");
    expect(getWatchTreeNodeRemoveMode({ kind: "workflow" }, 0)).toBe("remove");
  });

  it("dismisses group removal confirmations when the pointer leaves their header", () => {
    expect(
      shouldDismissPendingTreeActionOnHeaderLeave(
        { mode: "remove", nodeId: "repo:getsentry/sentry", rowIds: ["getsentry/sentry/run/123"] },
        "repo:getsentry/sentry",
      ),
    ).toBe(true);
    expect(
      shouldDismissPendingTreeActionOnHeaderLeave(
        { mode: "ignore-pr-workflow", nodeId: "workflow:CI", rowIds: ["getsentry/sentry/run/123"] },
        "workflow:Build",
      ),
    ).toBe(false);
    expect(shouldDismissPendingTreeActionOnHeaderLeave(undefined, "workflow:CI")).toBe(false);
  });

  it("wires tree headers to dismiss pending group confirmations on mouse leave", () => {
    expect(mainSource).toContain('querySelectorAll<HTMLElement>(".watch-tree-header")');
    expect(mainSource).toContain('header.addEventListener("mouseleave"');
    expect(mainSource).toContain("dismissTreeActionOnHeaderLeave");
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
    expect(styles).toMatch(/\.watch-group-title\s*\{[^}]*color:\s*rgb\(238 241 245 \/ 72%\);/s);
  });

  it("uses one compact alignment grid for repository, tree, and leaf rows", () => {
    expect(styles).toMatch(/\.watch-list\s*\{[^}]*--tree-left-padding:\s*4px;/s);
    expect(styles).toMatch(/\.watch-list\s*\{[^}]*--tree-chevron-width:\s*12px;/s);
    expect(styles).toMatch(/\.watch-list\s*\{[^}]*--tree-column-gap:\s*4px;/s);
    expect(styles).toMatch(
      /\.watch-group-header\s*\{[^}]*grid-template-columns:\s*var\(--tree-chevron-width\) var\(--tree-leading-width\) minmax\(0,\s*1fr\) var\(\s*--repo-actions-width\s*\);/s,
    );
    expect(styles).toMatch(/\.watch-group-header\s*\{[^}]*padding:\s*4px 6px 4px var\(--tree-left-padding\);/s);
    expect(styles).toMatch(
      /\.watch-tree-header\s*\{[^}]*padding:\s*8px 6px 8px calc\(var\(--tree-left-padding\) \+ var\(--tree-indent,\s*0px\)\);/s,
    );
    expect(styles).toMatch(
      /\.watch\s*\{[^}]*padding:\s*8px 6px 8px\s*calc\(\s*var\(--tree-left-padding\) \+ var\(--tree-chevron-width\) \+ var\(--tree-column-gap\) \+\s*var\(--watch-indent,\s*0px\)\s*\);/s,
    );
  });

  it("keeps job rows on the same vertical rhythm as PR and workflow rows", () => {
    expect(styles).toMatch(/\.watch-tree-header\s*\{[^}]*min-height:\s*52px;/s);
    expect(styles).toMatch(/\.watch\s*\{[^}]*min-height:\s*52px;/s);
    expect(styles).toMatch(/\.watch-actions\s*\{[^}]*margin-top:\s*-2px;/s);
  });

  it("uses the same base background for PR, workflow, and job rows", () => {
    expect(styles).toMatch(/\.watch-tree-header\s*\{[^}]*background:\s*var\(--watch-row-bg\);/s);
    expect(styles).toMatch(/\.watch\s*\{[^}]*background:\s*var\(--watch-row-bg\);/s);
    expect(styles).toMatch(/\.watch-tree-header:hover\s*\{[^}]*--watch-row-bg:\s*#1a2028;/s);
    expect(styles).toMatch(/\.watch:hover\s*\{[^}]*--watch-row-bg:\s*#1a2028;/s);
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
    expect(mainSource).toContain("function renderWatchTreeActions(node: WatchTreeNodeViewModel, depth: number): string");
    expect(mainSource).not.toContain("const chevron = renderWatchTreeChevron");
    expect(mainSource).not.toContain("${chevron}");
    expect(mainSource).toContain('data-action="toggle-tree-node"');
    expect(styles).toMatch(
      /\.watch-tree-header:hover \.watch-tree-chevron:not\(\[aria-disabled="true"\]\),[^{]*\.watch-tree-header:focus-within \.watch-tree-chevron:not\(\[aria-disabled="true"\]\)\s*\{[^}]*color:\s*rgb\(238 241 245 \/ 80%\);/s,
    );
    expect(styles).not.toMatch(/\.watch-tree-header:hover \.watch-tree-chevron[^{]*\{[^}]*background:/s);
  });

  it("renders repository chevrons on the left with the same treatment as tree chevrons", () => {
    expect(mainSource).toContain("${renderRepoGroupChevron(group, actions, isCollapsed)}");
    expect(mainSource).toContain('class="watch-tree-chevron watch-group-toggle-chevron"');
    expect(mainSource).not.toContain('class="watch-group-chevron"');
    expect(styles).not.toContain(".watch-group-chevron");
    expect(styles).toMatch(
      /\.watch-group-header\s*\{[^}]*grid-template-columns:\s*var\(--tree-chevron-width\) var\(--tree-leading-width\) minmax\(0,\s*1fr\) var\(\s*--repo-actions-width\s*\);/s,
    );
    expect(mainSource).toContain(
      'event.target.closest(".watch-group-star, .watch-group-actions, .repo-action-menu, .watch-group-toggle-chevron")',
    );
    expect(styles).toMatch(
      /\.watch-group-header:hover \.watch-tree-chevron:not\(\[aria-disabled="true"\]\),[^{]*\.watch-group-header:focus-within \.watch-tree-chevron:not\(\[aria-disabled="true"\]\)/s,
    );
  });

  it("renders repository removal controls and hides repo quick actions until hover", () => {
    expect(mainSource).toContain("renderRepoGroupActions(group, actions)");
    expect(mainSource).toContain('data-action="arm-remove-repo"');
    expect(mainSource).toContain('data-action="confirm-remove-repo"');
    expect(mainSource).toContain("dismissRepoActionOnHeaderLeave");
    expect(mainSource).toContain("removeRepoGroupWatches");
    expect(styles).toMatch(/\.watch-list\s*\{[^}]*--repo-actions-width:\s*72px;/s);
    expect(styles).toMatch(
      /\.watch-group-workflow-button,[^{]*\.watch-group-pr-button,[^{]*\.watch-group-remove-button\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;[^}]*visibility:\s*hidden;/s,
    );
    expect(styles).toMatch(
      /\.watch-group-header:hover \.watch-group-workflow-button,[^{]*\.watch-group-header:hover \.watch-group-pr-button,[^{]*\.watch-group-header:hover \.watch-group-remove-button/s,
    );
  });

  it("uses explicit hover-only open-link actions instead of overloading row clicks", () => {
    expect(mainSource).toContain("const hasVisibleChildren = node.children.length > 0 || node.rows.length > 0;");
    expect(mainSource).toContain("renderOpenLinkButton(\"watch-tree-action-button open-link-button\"");
    expect(mainSource).toContain("renderOpenLinkButton(\"watch-action-button open-link-button\"");
    expect(mainSource).toContain('data-url="${escapeHtml(url)}"');
    expect(mainSource).toContain('class="watch-main"');
    expect(mainSource).not.toContain('<button class="watch-main" type="button" data-action="open"');
    expect(styles).toMatch(/\.watch-list\s*\{[^}]*--tree-actions-width:\s*63px;/s);
    expect(styles).toMatch(
      /\.watch \.watch-action-button\.rerun-button,[^{]*\.watch \.watch-action-button\.open-link-button,[^{]*\.watch \.watch-action-button\.remove-button\s*\{[^}]*visibility:\s*hidden;[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.watch:hover \.watch-action-button\.rerun-button,[^{]*\.watch:focus-within \.watch-action-button\.rerun-button,[^{]*\.watch:hover \.watch-action-button\.open-link-button/s,
    );
    expect(styles).not.toMatch(/\.watch:hover\s*\{[^}]*background:\s*rgb\(255 255 255 \/ 6%\);/s);
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

  it("renders unseen tree indicators on the leading icon and keeps remove controls available", () => {
    expect(mainSource).toContain("renderWatchTreeLeading(node, depth, actionLabel, treeToggleAttributes, isCollapsed)");
    expect(mainSource).toContain("shouldShowWatchTreeUnseenIndicator(node, isCollapsed)");
    expect(mainSource).toContain("hasVisibleUnseenDescendantIndicator(node)");
    expect(mainSource).toContain('data-action="mark-seen"');
    expect(mainSource).toContain('data-row-ids="${escapeHtml(node.rowIds.join("\\n"))}"');
    expect(styles).not.toMatch(/\.watch\.has-unseen-change \.watch-action-button\.remove-button/);
    expect(styles).toMatch(
      /\.watch-list\.is-reordering-runs \.watch-tree-node\.is-row-dragging > \.watch-tree-header \.unseen-dot\s*\{[^}]*display:\s*none;/s,
    );
  });

  it("keeps action tooltips short while preserving descriptive accessible labels", () => {
    expect(mainSource).toContain('title="Open"');
    expect(mainSource).toContain('title="Remove"');
    expect(mainSource).toContain('aria-label="Open ${escapeHtml(label)} in GitHub"');
    expect(mainSource).toContain('aria-label="Remove ${escapeHtml(node.label)}"');
    expect(mainSource).not.toContain('title="Open ${escapeHtml(label)} in GitHub"');
    expect(mainSource).not.toContain('title="Remove ${escapeHtml(node.label)}"');
    expect(mainSource).not.toContain('title="Remove ${escapeHtml(group.repoLabel)}"');
  });

  it("aligns top-level group close controls with row close controls", () => {
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
      /\.watch\s*\{[^}]*padding:\s*8px 6px 8px\s*calc\(\s*var\(--tree-left-padding\) \+ var\(--tree-chevron-width\) \+ var\(--tree-column-gap\) \+\s*var\(--watch-indent,\s*0px\)\s*\);/s,
    );
    expect(styles).toMatch(/\.watch-actions\s*\{[^}]*margin-top:\s*-2px;/s);
  });

  it("only reveals close controls for the hovered or focused row", () => {
    expect(styles).toMatch(
      /\.watch \.watch-action-button\.remove-button\s*\{[^}]*visibility:\s*hidden;[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.watch:hover \.watch-action-button\.remove-button,[^{]*\.watch:focus-within \.watch-action-button\.remove-button\s*\{[^}]*visibility:\s*visible;[^}]*opacity:\s*0\.6;[^}]*pointer-events:\s*auto;/s,
    );
    expect(styles).not.toMatch(/\.watch\.has-unseen-change \.watch-action-button\.remove-button/);
  });

  it("uses the same quiet red treatment for close controls", () => {
    expect(styles).toMatch(
      /\.watch-tree-action-button\s*\{[^}]*background:\s*transparent;[^}]*color:\s*#ff7b72;/s,
    );
    expect(styles).toMatch(/\.remove-button\s*\{[^}]*color:\s*#ff7b72;/s);
    expect(styles).toMatch(
      /\.watch-action-button\.remove-button:hover,[^{]*\.watch-action-button\.remove-button:focus-visible\s*\{[^}]*background:\s*rgb\(248 81 73 \/ 12%\);[^}]*color:\s*#ff7b72;/s,
    );
    expect(styles).not.toMatch(/\.watch-tree-action-button\s*\{[^}]*background:\s*rgb\(248 81 73 \/ 12%\);/s);
  });
});
