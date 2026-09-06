import type { WatchRowViewModel } from "../app/viewModel";
import type { WatchTriageState } from "../domain/watches";
import { getWatchTriageActions } from "../app/watchTriage";
import { getPrStateIconSvg } from "../app/prStateIcon";
import { getWatchSubjectIconSvg } from "../app/watchSubjectIcon";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderBranchBadge(branchName: string | undefined): string {
  const cleanBranchName = branchName?.trim();

  if (!cleanBranchName) {
    return "";
  }

  return `<span class="watch-branch-badge" title="${escapeHtml(cleanBranchName)}">${escapeHtml(cleanBranchName)}</span>`;
}

export function renderChevronIcon(collapsed: boolean): string {
  const path = collapsed ? "m6 3.75 4.25 4.25L6 12.25" : "m3.75 6 4.25 4.25L12.25 6";

  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="${path}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
    </svg>
  `;
}

export function renderPrStateIcon(
  prState: NonNullable<WatchRowViewModel["prState"]>,
  className = "pr-state-icon",
): string {
  const label = escapeHtml(prState.label);

  return `
    <span
      class="${className} pr-state-icon pr-state-icon-${prState.tone}"
      title="Pull request ${label}"
      aria-label="Pull request ${label}"
    >
      ${getPrStateIconSvg(prState.tone)}
    </span>
  `;
}

export function renderWatchSubjectIcon(
  subject: Exclude<WatchRowViewModel["subject"], "pull-request">,
  className = "watch-leading-icon",
): string {
  return `
    <span
      class="${className} watch-subject-icon watch-subject-icon-${subject}"
      title="${subject === "job" ? "Workflow job" : "Workflow run"}"
      aria-label="${subject === "job" ? "Workflow job" : "Workflow run"}"
    >
      ${getWatchSubjectIconSvg(subject)}
    </span>
  `;
}

export function renderTriageButtons(
  currentState: WatchTriageState,
  rowIds: string[],
  className: string,
  subjectLabel: string,
  doneCandidate = false,
): string {
  const triageButtons = getWatchTriageActions(currentState)
    .map(
      (action) => `
        <button
          class="${className} watch-triage-button is-${action.state}${action.state === "done" && doneCandidate ? " is-done-candidate" : ""}"
          type="button"
          data-action="triage-watch"
          data-triage-state="${action.state}"
          data-row-ids="${escapeHtml(rowIds.join("\n"))}"
          title="${action.label}"
          aria-label="${action.label} ${escapeHtml(subjectLabel)}"
        >
          ${renderTriageIcon(action.state)}
        </button>
      `,
    )
    .join("");

  if (currentState !== "done") {
    return triageButtons;
  }

  return `${triageButtons}
    <button
      class="${className} watch-clear-done-button"
      type="button"
      data-action="clear-done-watch"
      data-row-ids="${escapeHtml(rowIds.join("\n"))}"
      title="Remove from Done"
      aria-label="Remove ${escapeHtml(subjectLabel)} from Done"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/>
      </svg>
    </button>
  `;
}

function renderTriageIcon(state: WatchTriageState): string {
  if (state === "inbox") {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.25 3.25h11.5v9.5H2.25zM2.25 9h3l1.25 1.5h3L10.75 9h3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/>
      </svg>
    `;
  }

  if (state === "saved") {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 2.25h8v11.5L8 11.2l-4 2.55z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.25 8.25 3 3 6.5-6.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
    </svg>
  `;
}

