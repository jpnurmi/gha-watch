import type { AuthoredOpenPullRequest } from "../app/githubPort";
import { getPullRequestDiscoveryId } from "../app/pullRequestDiscovery";
import { renderTitleMarkup } from "../app/titleMarkup";
import { escapeHtml, renderPrStateIcon } from "./markup";

export type PullRequestDiscoveryState =
  | { status: "idle" | "loading" }
  | { status: "loaded"; pullRequests: AuthoredOpenPullRequest[]; loadedAt: number }
  | { status: "error"; error: string };

export function renderAddForm(
  pullRequestDiscovery: PullRequestDiscoveryState,
  pullRequests: AuthoredOpenPullRequest[],
  addError?: string,
): string {

  return `
    <form class="add-form" data-role="add-form">
      <div class="add-discovery-header">
        <span class="add-discovery-title">Unwatched PRs</span>
        <button class="add-form-dismiss" type="button" data-action="close-add" title="Cancel" aria-label="Cancel adding">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"/>
          </svg>
        </button>
      </div>
      ${renderPullRequestDiscovery(pullRequests, pullRequestDiscovery)}
      <div class="add-manual-entry">
        <div class="add-field">
          <input
            name="url"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="owner/repo#1234"
            aria-label="GitHub repository, Actions URL, or pull request slug"
            aria-describedby="add-form-hint"
          />
          <div class="add-field-actions">
            <button class="add-form-submit" type="submit">Add</button>
          </div>
        </div>
        <p class="form-hint" id="add-form-hint">or https://github.com/OWNER/REPO/actions/runs/RUN_ID</p>
        ${addError ? `<p class="form-error">${escapeHtml(addError)}</p>` : ""}
      </div>
    </form>
  `;
}

function renderPullRequestDiscovery(pullRequests: AuthoredOpenPullRequest[], pullRequestDiscovery: PullRequestDiscoveryState): string {
  if (pullRequestDiscovery.status === "idle" || pullRequestDiscovery.status === "loading") {
    return `<p class="add-discovery-status">Finding PRs…</p>`;
  }

  if (pullRequestDiscovery.status === "error") {
    return `
      <div class="add-discovery-status add-discovery-error">
        <span title="${escapeHtml(pullRequestDiscovery.error)}">Couldn’t find PRs</span>
        <button type="button" data-action="retry-pr-discovery">Retry</button>
      </div>
    `;
  }

  if (pullRequests.length === 0) {
    return `<p class="add-discovery-status">No unwatched PRs</p>`;
  }

  return `
    <ul class="add-discovery-list">
      ${pullRequests.map((pullRequest) => {
        const id = getPullRequestDiscoveryId(pullRequest);
        const updated = formatDiscoveredPullRequestDate(pullRequest.updatedAt);
        const prState = pullRequest.isDraft
          ? { label: "Draft", tone: "draft" as const }
          : { label: "Ready", tone: "ready" as const };

        return `
        <li class="add-discovery-item">
          <span class="add-discovery-leading" aria-hidden="true">
            ${renderPrStateIcon(prState, "add-discovery-pr-icon")}
          </span>
          <span class="add-discovery-details">
            <span class="watch-label add-discovery-label">
              <button
                class="watch-title-link add-discovery-pr-title"
                type="button"
                data-action="open-github-url"
                data-url="${escapeHtml(pullRequest.url)}"
                title="Open on GitHub"
                aria-label="Open ${escapeHtml(pullRequest.title)} on GitHub"
              ><span class="watch-title-text">${renderTitleMarkup(pullRequest.title)}</span></button>
              <span class="watch-title-reference">#${escapeHtml(pullRequest.number)}</span>
            </span>
            <span class="watch-meta add-discovery-meta">
              <span class="watch-meta-text">${escapeHtml(`${pullRequest.owner}/${pullRequest.repo}`)}${updated ? ` · Updated ${escapeHtml(updated)}` : ""}</span>
            </span>
          </span>
          <button
            class="add-discovery-add"
            type="button"
            data-action="add-discovered-pr"
            data-pr-id="${escapeHtml(id)}"
            title="Add pull request"
            aria-label="Add ${escapeHtml(`${pullRequest.owner}/${pullRequest.repo} pull request ${pullRequest.number}`)}"
          >+</button>
          <button
            class="add-discovery-dismiss"
            type="button"
            data-action="dismiss-discovered-pr"
            data-pr-id="${escapeHtml(id)}"
            title="Dismiss suggestion"
            aria-label="Dismiss ${escapeHtml(`${pullRequest.owner}/${pullRequest.repo} pull request ${pullRequest.number}`)}"
          >×</button>
        </li>
      `;
      }).join("")}
    </ul>
  `;
}

function formatDiscoveredPullRequestDate(value: string | undefined): string | undefined {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return undefined;
  }

  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
