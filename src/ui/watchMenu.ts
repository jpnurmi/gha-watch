import type { WatchGroupViewModel, WatchRowViewModel } from "../app/viewModel";
import { getWatchTriageActions } from "../app/watchTriage";
import { getWatchedRepoKey } from "../domain/watchedRepos";
import type { WatchTriageState } from "../domain/watches";
import { escapeHtml, renderMoreIcon } from "./markup";

export function renderWatchMenu(row: WatchRowViewModel): string {
  const id = escapeHtml(row.id);
  const item = (action: string, label: string, attributes = "") => `
    <button class="repo-action-item" type="button" role="menuitem" tabindex="-1" data-action="${action}" data-id="${id}" data-row-ids="${id}" ${attributes}>
      <span class="repo-action-title">${label}</span>
    </button>`;
  const separator = '<div class="watch-menu-separator" role="separator"></div>';

  return `
    <div class="repo-action-popover watch-menu-popover" role="menu" aria-label="Actions for ${escapeHtml(row.label)}">
      ${item("open-github-url", "Open in GitHub", `data-url="${escapeHtml(row.url)}"`)}
      ${item("edit-note", row.note ? "Edit note…" : "Add note…")}
      ${row.canRerun ? `${separator}
        ${item("rerun-all", "Re-run all jobs")}
        ${row.canRerunFailed ? item("rerun-failed", "Re-run failed jobs") : ""}` : ""}
      ${separator}
      ${renderTriageMenuItems(row.triageState, [row.id])}
    </div>
  `;
}

export function renderRepoMenu(group: WatchGroupViewModel, state: WatchTriageState, open: boolean): string {
  if (!group.rows.length) return "";
  const finishedIds = group.rows.filter((row) => !row.active).map((row) => row.id);

  return `
    <span class="repo-action-menu repo-action-menu-container watch-menu-control">
      <button class="watch-group-menu-button" type="button" data-action="toggle-watch-menu" data-id="${escapeHtml(getWatchedRepoKey(group))}" title="More" aria-label="More actions for ${escapeHtml(group.repoLabel)}" aria-haspopup="menu" aria-expanded="${open}">
        ${renderMoreIcon()}
      </button>
      ${open ? `
        <div class="repo-action-popover watch-menu-popover" role="menu" aria-label="Actions for ${escapeHtml(group.repoLabel)}">
          ${renderTriageMenuItems(state, group.rows.map((row) => row.id), true)}
          ${state !== "done" ? `
            <button class="repo-action-item" type="button" role="menuitem" tabindex="-1" data-action="triage-watch" data-triage-state="done" data-row-ids="${escapeHtml(finishedIds.join("\n"))}" ${finishedIds.length ? "" : "disabled"}>
              <span class="repo-action-title">Mark finished done</span>
            </button>` : ""}
        </div>` : ""}
    </span>
  `;
}

function renderTriageMenuItems(state: WatchTriageState, rowIds: string[], bulk = false): string {
  const ids = escapeHtml(rowIds.join("\n"));
  const items = getWatchTriageActions(state).map((action) => {
    const label = bulk ? {
      inbox: "Move all to Inbox",
      saved: "Make all drafts",
      done: "Mark all done",
    }[action.state] : action.label;

    return `
      <button class="repo-action-item" type="button" role="menuitem" tabindex="-1" data-action="triage-watch" data-triage-state="${action.state}" data-row-ids="${ids}">
        <span class="repo-action-title">${label}</span>
      </button>`;
  }).join("");

  return `${items}${state === "done" ? `
    <button class="repo-action-item watch-clear-done-button" type="button" role="menuitem" tabindex="-1" data-action="clear-done-watch" data-row-ids="${ids}">
      <span class="repo-action-title">${bulk ? "Remove all" : "Remove"}</span>
    </button>` : ""}`;
}

export function positionWatchMenu(root: HTMLElement): void {
  const menu = root.querySelector<HTMLElement>(".watch-menu-popover");
  const button = root.querySelector<HTMLElement>('[data-action="toggle-watch-menu"][aria-expanded="true"]');
  if (!menu || !button) return;

  menu.style.maxHeight = "";
  const anchor = button.getBoundingClientRect();
  const bounds = menu.getBoundingClientRect();
  const viewport = root.ownerDocument.documentElement;
  const margin = 8;
  const below = viewport.clientHeight - margin - anchor.bottom - 4;
  const above = anchor.top - margin - 4;
  const opensBelow = bounds.height <= below || below >= above;
  const height = Math.max(0, opensBelow ? below : above);
  const top = opensBelow ? anchor.bottom + 4 : anchor.top - Math.min(bounds.height, height) - 4;
  menu.style.maxHeight = `${height}px`;
  menu.style.left = `${Math.max(margin, Math.min(anchor.right - bounds.width, viewport.clientWidth - bounds.width - margin))}px`;
  menu.style.top = `${Math.max(margin, Math.min(top, viewport.clientHeight - Math.min(bounds.height, height) - margin))}px`;
}

export function moveWatchMenuFocus(menu: HTMLElement, key: string): boolean {
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
  if (!items.length) return false;
  const current = items.indexOf(menu.ownerDocument.activeElement as HTMLButtonElement);
  let next: number;
  switch (key) {
    case "ArrowDown": next = (current + 1) % items.length; break;
    case "ArrowUp": next = current <= 0 ? items.length - 1 : current - 1; break;
    case "Home": next = 0; break;
    case "End": next = items.length - 1; break;
    default: return false;
  }
  items[next].focus();
  return true;
}
