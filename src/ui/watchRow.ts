import type { WatchRowViewModel, RowTone } from "../app/viewModel";
import type { PendingWatchAction } from "../app/watchActionConfirmation";
import { renderWatchLeadingSlot } from "../app/dragGlyph";
import { getStatusIconSvg } from "../app/statusIcon";
import { getWatchActionsUrl } from "../app/watchLinks";
import { getRerunActionIconSvg } from "../app/actionIcon";
import { renderTitleMarkup } from "../app/titleMarkup";
import { escapeHtml, renderBranchBadge, renderPrStateIcon, renderWatchSubjectIcon, renderTriageButtons } from "./markup";

export function renderWatch(row: WatchRowViewModel, pendingWatchAction?: PendingWatchAction): string {
  const hasConfirmation = pendingWatchAction?.id === row.id;
  const hasActions = true;
  const hasDoneCandidate = row.triageState !== "done" && row.doneCandidate;

  return `
    <li
      class="watch is-${row.tone}${row.prState ? " has-pr-state" : ""}${row.draftLike ? " is-draft-like" : ""}${row.unseenStatusChange ? " has-unseen-change" : ""}${hasActions ? " has-actions" : ""}${hasDoneCandidate ? " has-done-candidate" : ""}${hasConfirmation ? " has-confirmation" : ""}"
      data-id="${escapeHtml(row.id)}"
      data-reorder-key="${escapeHtml(row.id)}"
      data-row-ids="${escapeHtml(row.id)}"
    >
      ${renderLeadingIcon(row)}
      <div class="watch-main">
        <span class="watch-label">
          ${renderWatchTitleLink(
            row.label,
            [row.referenceLabel, row.pullRequestReferenceLabel],
            row.url,
            [row.id],
            row.unseenStatusChange,
          )}
        </span>
        ${renderMetadata(row)}
      </div>
      ${renderWatchActions(row, hasDoneCandidate, pendingWatchAction)}
    </li>
  `;
}

function renderLeadingIcon(row: WatchRowViewModel): string {
  if (row.subject === "pull-request") {
    const prState = row.prState ?? { label: "Ready", tone: "ready" as const };
    return renderWatchLeadingSlot(renderPrStateIcon(prState, "watch-leading-icon"));
  }

  if (row.subject === "job") {
    return renderWatchLeadingSlot(renderWatchSubjectIcon("job"));
  }

  return renderWatchLeadingSlot(renderWatchSubjectIcon("workflow"));
}

function renderMetadata(row: WatchRowViewModel): string {
  const items: string[] = [];

  items.push(renderWorkflowStatus(row));

  const detail = getMetadataDetail(row);

  if (detail) {
    items.push(`<span class="watch-meta-text">${escapeHtml(detail)}</span>`);
  }

  return renderWatchMetadataContent(items, row.branchName);
}

function renderWatchMetadataContent(items: string[], branchName: string | undefined): string {
  const content = items.join(renderMetaSeparator()) + renderBranchBadge(branchName);

  return `<span class="watch-meta${branchName ? " has-branch-badge" : ""}">${content}</span>`;
}

function renderMetaSeparator(): string {
  return `<span class="watch-meta-separator">·</span>`;
}

function renderWorkflowStatus(row: WatchRowViewModel): string {
  return renderWorkflowStatusIcon(row.id, row.tone, row.statusLabel, row.hasFailedChildren, {
    url: getWatchActionsUrl(row.subject, row.url),
    rowIds: [row.id],
    label: row.label,
  });
}

function renderWorkflowStatusIcon(
  id: string,
  tone: RowTone,
  statusLabel: string,
  hasFailedChildren = false,
  link?: { url: string; rowIds: string[]; label: string },
): string {
  const className = `watch-workflow-status status-icon-${tone}${hasFailedChildren ? " has-failed-children" : ""}`;
  const content = `${getStatusIconSvg(tone, `${id}-workflow`)}<span>${escapeHtml(statusLabel)}</span>`;

  if (!link) {
    return `<span class="${className}">${content}</span>`;
  }

  return `
    <button
      class="${className}"
      type="button"
      data-action="open-github-url"
      data-url="${escapeHtml(link.url)}"
      data-row-ids="${escapeHtml(link.rowIds.join("\n"))}"
      title="Open Actions status"
      aria-label="Open Actions status for ${escapeHtml(link.label)}"
    >
      ${content}
    </button>
  `;
}

function renderWatchTitleLink(
  label: string,
  referenceLabels: Array<string | undefined>,
  url: string | undefined,
  rowIds: string[],
  unseenStatusChange: boolean,
): string {
  const references = referenceLabels
    .filter((reference): reference is string => Boolean(reference))
    .map((reference) => `<span class="watch-title-reference">${escapeHtml(reference)}</span>`)
    .join("");
  const content = `
    <span class="watch-title-text" title="${escapeHtml(label)}">${renderTitleMarkup(label)}</span>
    ${references}
  `;

  if (!url) {
    if (unseenStatusChange) {
      return `
        <button
          class="watch-title-cluster watch-title-link"
          type="button"
          data-action="mark-seen"
          data-id="${escapeHtml(rowIds[0] ?? "")}"
          data-row-ids="${escapeHtml(rowIds.join("\n"))}"
          aria-label="Mark ${escapeHtml(label)} seen"
        >
          ${content}
        </button>
      `;
    }

    return `<span class="watch-title-cluster">${content}</span>`;
  }

  return `
    <button
      class="watch-title-cluster watch-title-link"
      type="button"
      data-action="open-github-url"
      data-url="${escapeHtml(url)}"
      data-row-ids="${escapeHtml(rowIds.join("\n"))}"
      aria-label="Open ${escapeHtml(label)} on GitHub"
    >
      ${content}
    </button>
  `;
}

function getMetadataDetail(row: WatchRowViewModel): string | undefined {
  if (row.timingText) {
    return row.timingText;
  }

  return row.tone === "error" ? row.description : undefined;
}

function renderWatchActions(row: WatchRowViewModel, hasDoneCandidate: boolean, pendingWatchAction?: PendingWatchAction): string {
  const rerunMenuOpen = pendingWatchAction?.id === row.id;

  return `
    <div class="watch-actions">
      ${
        row.canRerun
          ? `<span class="repo-action-menu repo-action-menu-container watch-rerun-control">
              <button class="watch-action-button rerun-button" type="button" data-action="arm-rerun" data-id="${escapeHtml(row.id)}" title="Re-run" aria-label="Re-run ${escapeHtml(row.label)}" aria-haspopup="menu" aria-expanded="${rerunMenuOpen ? "true" : "false"}">
                ${getRerunActionIconSvg()}
              </button>
              ${
                rerunMenuOpen
                  ? `<div class="repo-action-popover watch-rerun-popover" role="menu" aria-label="Re-run options for ${escapeHtml(row.label)}">
                      <button class="repo-action-item" type="button" role="menuitem" data-action="rerun-all" data-id="${escapeHtml(row.id)}">
                        <span class="repo-action-title">Re-run all jobs</span>
                      </button>
                      ${
                        row.canRerunFailed
                          ? `<button class="repo-action-item" type="button" role="menuitem" data-action="rerun-failed" data-id="${escapeHtml(row.id)}">
                              <span class="repo-action-title">Re-run failed jobs</span>
                            </button>`
                          : ""
                      }
                    </div>`
                  : ""
              }
            </span>`
          : ""
      }
      ${renderTriageButtons(row.triageState, [row.id], "watch-action-button", row.label, hasDoneCandidate)}
    </div>
  `;
}
