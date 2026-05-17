import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { getRerunActionIconSvg } from "./app/actionIcon";
import { createCollapsedGroups } from "./app/collapsedGroups";
import { getOverflowMenuItems, type OverflowMenuItem } from "./app/overflowMenu";
import { dismissPopupUi } from "./app/popupDismissal";
import { getPopupBodySections, type PopupBodySection } from "./app/popupLayout";
import { calculatePopupHeight, popupMinHeight, popupWidth } from "./app/popupSize";
import { getPrStateIconSvg } from "./app/prStateIcon";
import { getRepoHeaderActions } from "./app/repoHeaderActions";
import { getStatusIconSvg } from "./app/statusIcon";
import { createWatchController } from "./app/watchController";
import { isWatchActionConfirmation } from "./app/watchActionConfirmation";
import { createTrayState } from "./app/trayState";
import { createPopupViewModel, type WatchGroupViewModel, type WatchRowViewModel } from "./app/viewModel";
import { getWatchSubjectIconSvg } from "./app/watchSubjectIcon";
import type { WatchNotification } from "./app/watchNotification";
import {
  getFavoriteRepoKey,
  isFavoriteRepo,
  toggleFavoriteRepo,
  updateFavoriteRepoIcon,
  type FavoriteRepo,
} from "./domain/favorites";
import { isOwnerlessPullRequestSlug, parseGitHubActionsUrl, type ParsedWatchTarget } from "./domain/githubUrl";
import type { WatchRecord } from "./domain/watches";
import {
  fetchActiveWorkflowRuns,
  fetchAuthenticatedUserLogin,
  fetchOpenPullRequests,
  fetchRepositoryIconUrl,
  fetchWatchState,
  type ActiveWorkflowRun,
  type OpenPullRequest,
  rerunFailedWatch,
  resolvePrWatchTargets,
} from "./platform/gh";
import { clearDesktopNotifications, listenForDesktopNotificationClicks, sendDesktopNotification } from "./platform/notifications";
import { getAutoStartEnabled, setAutoStartEnabled } from "./platform/autostart";
import { loadSettings, loadWatches, saveSettings, saveWatches } from "./platform/store";
import { setTrayIndicator } from "./platform/tray";
import "./styles.css";

const pollIntervalMs = 30_000;
const appRoot = document.querySelector<HTMLDivElement>("#app");
document.documentElement.dataset.platform = /\bWindows\b/i.test(navigator.userAgent) ? "windows" : "default";

if (!appRoot) {
  throw new Error("App root was not found.");
}

const app = appRoot;
const isDemoMode =
  window.location.hostname === "127.0.0.1" &&
  new URLSearchParams(window.location.search).get("demo") === "checks";
let isAdding = false;
let addError: string | undefined;
let isPolling = false;
let isClearMenuOpen = false;
let autoStartEnabled = false;
let autoStartBusy = true;
let popupHeight = popupMinHeight;
const collapsedGroups = createCollapsedGroups();
let pendingWatchAction: PendingWatchAction | undefined;
let activeWorkflowRunMenu: ActiveWorkflowRunMenuState | undefined;
let favoritePrMenu: FavoritePullRequestMenuState | undefined;
let settings = loadSettings();

type PendingWatchAction = {
  id: string;
  kind: "remove" | "rerun";
};

type ActiveWorkflowRunMenuState =
  | {
      repoKey: string;
      status: "loading";
    }
  | {
      repoKey: string;
      status: "loaded";
      runs: ActiveWorkflowRun[];
    }
  | {
      repoKey: string;
      status: "error";
      error: string;
    };

type FavoritePullRequestMenuState =
  | {
      repoKey: string;
      status: "loading";
    }
  | {
      repoKey: string;
      status: "loaded";
      pullRequests: OpenPullRequest[];
    }
  | {
      repoKey: string;
      status: "error";
      error: string;
    };

const controller = createWatchController(
  {
    fetchState: isDemoMode
      ? async () => {
          throw new Error("Demo mode does not poll GitHub.");
        }
      : fetchWatchState,
    fetchActiveWorkflowRuns: isDemoMode ? fetchDemoActiveWorkflowRuns : fetchActiveWorkflowRuns,
    fetchOpenPullRequests: isDemoMode ? fetchDemoOpenPullRequests : fetchOpenPullRequests,
    fetchRepositoryIconUrl: isDemoMode ? async () => undefined : fetchRepositoryIconUrl,
    notify: notifyStatusChange,
    resolvePrWatchTargets: isDemoMode ? async () => ({ targets: [], sourceState: "ready" }) : resolvePrWatchTargets,
    rerunFailed: isDemoMode ? async () => undefined : rerunFailedWatch,
    save: saveWatches,
  },
  loadInitialWatches(),
  {
    autoClearMergedPrWatches: settings.autoClearMergedPrWatches,
  },
);

function notifyStatusChange(notification: WatchNotification): Promise<void> {
  return sendDesktopNotification(notification);
}

controller.subscribe(() => {
  render();
  void updateTrayIndicator();
});

render();
void updateTrayIndicator();
void refreshAutoStartState();
void controller.refreshRepositoryIcons();
void controller.refreshWatchMetadata();
void listenForDesktopNotificationClicks((click) => {
  controller.markSeen(click.watchId);
  void openUrl(click.url);
});
window.setInterval(() => {
  void poll();
}, pollIntervalMs);
void poll();
document.addEventListener(
  "click",
  (event) => {
    if (!pendingWatchAction) {
      return;
    }

    const target = event.target;
    const actionTarget = target instanceof Element ? target.closest<HTMLElement>("[data-action]") : null;
    const action = actionTarget?.dataset.action;

    if (isWatchActionConfirmation(action)) {
      return;
    }

    pendingWatchAction = undefined;
    render();
    event.preventDefault();
    event.stopPropagation();
  },
  { capture: true },
);
document.addEventListener("click", (event) => {
  const target = event.target;

  if (isClearMenuOpen) {
    if (target instanceof Element && target.closest(".clear-menu")) {
      return;
    }

    isClearMenuOpen = false;
    render();
  }

  if (activeWorkflowRunMenu || favoritePrMenu) {
    if (target instanceof Element && target.closest(".repo-action-menu")) {
      return;
    }

    activeWorkflowRunMenu = undefined;
    favoritePrMenu = undefined;
    render();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    void hideMainWindow();
  }
});
void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
  if (!focused) {
    void acknowledgePopupDismissal();
  }
});

function render(): void {
  const watches = controller.getWatches();
  const viewModel = createPopupViewModel(watches, new Date(), settings.favoriteRepos);
  const hasWatches = watches.length > 0;
  const hasFinishedWatches = watches.some((watch) => !watch.active);

  app.innerHTML = `
    <section class="shell">
      <header class="header">
        <div>
          <h1 class="header-title is-${viewModel.headerTone}">${escapeHtml(viewModel.title)}</h1>
          <p>${escapeHtml(viewModel.subtitle)}</p>
        </div>
        <div class="header-actions">
          <button class="icon-button" type="button" data-action="toggle-add" title="Add watch" aria-label="Add watch">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3.25v9.5M3.25 8h9.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"/>
            </svg>
          </button>
          <div class="clear-menu">
            <button
              class="icon-button menu-button"
              type="button"
              data-action="toggle-clear-menu"
              title="More"
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded="${isClearMenuOpen ? "true" : "false"}"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="3.75" r="1.25" fill="currentColor"/>
                <circle cx="8" cy="8" r="1.25" fill="currentColor"/>
                <circle cx="8" cy="12.25" r="1.25" fill="currentColor"/>
              </svg>
            </button>
            ${
              isClearMenuOpen
                ? renderClearMenu(hasWatches, hasFinishedWatches)
                : ""
            }
          </div>
        </div>
      </header>

      ${getPopupBodySections(isAdding)
        .map((section) => renderPopupBodySection(section, viewModel))
        .join("")}
    </section>
  `;

  bindEvents();
  void resizePopupToContent();
}

function renderPopupBodySection(
  section: PopupBodySection,
  viewModel: ReturnType<typeof createPopupViewModel>,
): string {
  if (section === "add-form") {
    return renderAddForm();
  }

  return renderWatchList(viewModel);
}

function renderWatchList(viewModel: ReturnType<typeof createPopupViewModel>): string {
  return `
    <ul class="watch-list">
      ${
        viewModel.groups.length === 0
          ? `<li class="empty">
              <div class="empty-content">
                <button class="empty-action" type="button" data-action="toggle-add">Add watch</button>
              </div>
            </li>`
          : viewModel.groups.map(renderWatchGroup).join("")
      }
    </ul>
  `;
}

function renderAddForm(): string {
  return `
    <form class="add-form" data-role="add-form">
      <div class="add-field">
        <button class="add-form-dismiss" type="button" data-action="close-add" title="Cancel" aria-label="Cancel adding watch">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"/>
          </svg>
        </button>
        <input
          name="url"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="owner/repo#1234"
          aria-label="GitHub Actions URL or pull request slug"
          aria-describedby="add-form-hint"
        />
        <div class="add-field-actions">
          <button class="add-form-submit" type="submit">Watch</button>
        </div>
      </div>
      <p class="form-hint" id="add-form-hint">or https://github.com/OWNER/REPO/actions/runs/RUN_ID</p>
      ${addError ? `<p class="form-error">${escapeHtml(addError)}</p>` : ""}
    </form>
  `;
}

function renderWatchGroup(group: WatchGroupViewModel): string {
  const isCollapsed = collapsedGroups.has(group.repoLabel);
  const actions = getRepoHeaderActions({ favorite: group.favorite });

  return `
    <li class="watch-group${isCollapsed ? " is-collapsed" : ""}">
      <div class="watch-group-header">
        ${renderFavoriteRepoButton(group)}
        <button
          class="watch-group-toggle"
          type="button"
          data-action="toggle-group"
          data-repo="${escapeHtml(group.repoLabel)}"
          aria-expanded="${isCollapsed ? "false" : "true"}"
        >
          <span class="watch-group-meta">
            <span class="watch-group-title">${escapeHtml(group.repoLabel)}</span>
            <span class="watch-group-action watch-group-badge" aria-hidden="true">${group.rows.length}</span>
          </span>
        </button>
        <div class="watch-group-actions">
          ${actions.showOpenPullRequests ? renderFavoritePullRequestMenu(group) : ""}
          ${actions.showActiveWorkflowRuns ? renderActiveWorkflowRunMenu(group) : ""}
          <button
            class="watch-group-chevron"
            type="button"
            data-action="toggle-group"
            data-repo="${escapeHtml(group.repoLabel)}"
            title="${isCollapsed ? "Expand" : "Collapse"}"
            aria-label="${isCollapsed ? "Expand" : "Collapse"} ${escapeHtml(group.repoLabel)}"
            aria-expanded="${isCollapsed ? "false" : "true"}"
          >
            ${renderChevronIcon(isCollapsed)}
          </button>
        </div>
      </div>
      ${
        isCollapsed || group.rows.length === 0
          ? ""
          : `<ul class="watch-group-list">
              ${group.rows.map(renderWatch).join("")}
            </ul>`
      }
    </li>
  `;
}

function renderFavoriteRepoButton(group: WatchGroupViewModel): string {
  return `
    <button
      class="watch-group-star${group.favorite ? " is-favorite" : ""}"
      type="button"
      data-action="toggle-favorite-repo"
      data-owner="${escapeHtml(group.owner)}"
      data-repo="${escapeHtml(group.repo)}"
      title="${group.favorite ? "Unfavorite" : "Favorite"}"
      aria-label="${group.favorite ? "Unfavorite" : "Favorite"} ${escapeHtml(group.repoLabel)}"
    >
      <span class="watch-group-icon" aria-hidden="true">
        ${renderRepoIcon(group)}
      </span>
      <span class="watch-group-star-glyph" aria-hidden="true">
        ${renderStarIcon(group.favorite)}
      </span>
    </button>
  `;
}

function renderStarIcon(filled: boolean): string {
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="m8 1.6 1.9 4 4.4.6-3.2 3.1.8 4.4L8 11.6l-3.9 2.1.8-4.4-3.2-3.1 4.4-.6L8 1.6Z"
        fill="${filled ? "currentColor" : "none"}"
        stroke="currentColor"
        stroke-linejoin="round"
        stroke-width="1.4"
      />
    </svg>
  `;
}

function renderChevronIcon(collapsed: boolean): string {
  const path = collapsed ? "m6 3.75 4.25 4.25L6 12.25" : "m3.75 6 4.25 4.25L12.25 6";

  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="${path}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
    </svg>
  `;
}

function renderActiveWorkflowRunMenu(group: WatchGroupViewModel): string {
  const repoKey = getFavoriteRepoKey(group);
  const menuState = activeWorkflowRunMenu?.repoKey === repoKey ? activeWorkflowRunMenu : undefined;

  return `
    <div class="repo-action-menu favorite-pr-menu">
      <button
        class="watch-group-workflow-button"
        type="button"
        data-action="toggle-active-workflows"
        data-owner="${escapeHtml(group.owner)}"
        data-repo="${escapeHtml(group.repo)}"
        title="Active runs"
        aria-label="Active workflow runs for ${escapeHtml(group.repoLabel)}"
        aria-haspopup="menu"
        aria-expanded="${menuState ? "true" : "false"}"
      >
        ${getWatchSubjectIconSvg("workflow")}
      </button>
      ${menuState ? renderActiveWorkflowRunPopover(group, menuState) : ""}
    </div>
  `;
}

function renderActiveWorkflowRunPopover(
  group: WatchGroupViewModel,
  menuState: ActiveWorkflowRunMenuState,
): string {
  if (menuState.status === "loading") {
    return `<div class="favorite-pr-popover" role="menu"><div class="favorite-pr-status">Loading...</div></div>`;
  }

  if (menuState.status === "error") {
    return `
      <div class="favorite-pr-popover" role="menu">
        <div class="favorite-pr-status is-error">${escapeHtml(menuState.error)}</div>
      </div>
    `;
  }

  if (menuState.runs.length === 0) {
    return `<div class="favorite-pr-popover" role="menu"><div class="favorite-pr-status">No active workflow runs</div></div>`;
  }

  return `
    <div class="favorite-pr-popover" role="menu">
      ${menuState.runs.map((run) => renderActiveWorkflowRunItem(group, run)).join("")}
    </div>
  `;
}

function renderActiveWorkflowRunItem(group: WatchGroupViewModel, run: ActiveWorkflowRun): string {
  return `
    <button
      class="favorite-pr-item"
      type="button"
      role="menuitem"
      data-action="watch-active-workflow"
      data-owner="${escapeHtml(group.owner)}"
      data-repo="${escapeHtml(group.repo)}"
      data-run="${escapeHtml(run.runId)}"
      data-url="${escapeHtml(run.url)}"
      title="${escapeHtml(run.title)}"
    >
      <span class="favorite-pr-number">${escapeHtml(formatWorkflowRunStatus(run.status))}</span>
      <span class="favorite-pr-title">${escapeHtml(run.title)}</span>
    </button>
  `;
}

function formatWorkflowRunStatus(status: string): string {
  return status
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function renderFavoritePullRequestMenu(group: WatchGroupViewModel): string {
  const repoKey = getFavoriteRepoKey(group);
  const menuState = favoritePrMenu?.repoKey === repoKey ? favoritePrMenu : undefined;

  return `
    <div class="repo-action-menu favorite-pr-menu">
      <button
        class="watch-group-pr-button"
        type="button"
        data-action="toggle-favorite-prs"
        data-owner="${escapeHtml(group.owner)}"
        data-repo="${escapeHtml(group.repo)}"
        title="Open PRs"
        aria-label="Open pull requests for ${escapeHtml(group.repoLabel)}"
        aria-haspopup="menu"
        aria-expanded="${menuState ? "true" : "false"}"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5 3a2 2 0 1 1-2-2 2 2 0 0 1 2 2Zm0 10a2 2 0 1 1-2-2 2 2 0 0 1 2 2Zm6 0a2 2 0 1 1 2 2 2 2 0 0 1-2-2ZM3 5v6m10 0V8.5A2.5 2.5 0 0 0 10.5 6H8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/>
        </svg>
      </button>
      ${menuState ? renderFavoritePullRequestPopover(group, menuState) : ""}
    </div>
  `;
}

function renderFavoritePullRequestPopover(
  group: WatchGroupViewModel,
  menuState: FavoritePullRequestMenuState,
): string {
  if (menuState.status === "loading") {
    return `<div class="favorite-pr-popover" role="menu"><div class="favorite-pr-status">Loading...</div></div>`;
  }

  if (menuState.status === "error") {
    return `
      <div class="favorite-pr-popover" role="menu">
        <div class="favorite-pr-status is-error">${escapeHtml(menuState.error)}</div>
      </div>
    `;
  }

  if (menuState.pullRequests.length === 0) {
    return `<div class="favorite-pr-popover" role="menu"><div class="favorite-pr-status">No open pull requests</div></div>`;
  }

  return `
    <div class="favorite-pr-popover" role="menu">
      ${menuState.pullRequests.map((pullRequest) => renderFavoritePullRequestItem(group, pullRequest)).join("")}
    </div>
  `;
}

function renderFavoritePullRequestItem(group: WatchGroupViewModel, pullRequest: OpenPullRequest): string {
  return `
    <button
      class="favorite-pr-item"
      type="button"
      role="menuitem"
      data-action="watch-favorite-pr"
      data-owner="${escapeHtml(group.owner)}"
      data-repo="${escapeHtml(group.repo)}"
      data-pr="${escapeHtml(pullRequest.number)}"
      title="#${escapeHtml(pullRequest.number)} ${escapeHtml(pullRequest.title)}"
    >
      <span class="favorite-pr-number">#${escapeHtml(pullRequest.number)}</span>
      <span class="favorite-pr-title">${escapeHtml(pullRequest.title)}</span>
      ${pullRequest.isDraft ? `<span class="favorite-pr-badge">Draft</span>` : ""}
    </button>
  `;
}

function renderRepoIcon(group: WatchGroupViewModel): string {
  if (group.repoIconUrl) {
    return `<img class="watch-group-avatar" src="${escapeHtml(group.repoIconUrl)}" alt="" />`;
  }

  return `
    <svg viewBox="0 0 24 24">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C16.3 4.6 17.3 5 17.3 5c.7 1.7.3 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z" fill="currentColor"/>
    </svg>
  `;
}

function renderWatch(row: WatchRowViewModel): string {
  return `
    <li class="watch is-${row.tone}${row.prState ? " has-pr-state" : ""}${row.unseenStatusChange ? " has-unseen-change" : ""}">
      ${renderLeadingIcon(row)}
      <button class="watch-main" type="button" data-action="open" data-id="${escapeHtml(row.id)}" title="Open in GitHub">
        <span class="watch-label">
          <span class="watch-title-text">${escapeHtml(row.label)}</span>
          ${row.prReference ? `<span class="watch-title-reference">${escapeHtml(row.prReference)}</span>` : ""}
        </span>
        ${renderMetadata(row)}
      </button>
      ${renderWatchActions(row)}
    </li>
  `;
}

function renderLeadingIcon(row: WatchRowViewModel): string {
  if (row.prState) {
    return renderPrStateIcon(row.prState, "watch-leading-icon");
  }

  if (row.subject === "job") {
    return renderWatchSubjectIcon("job");
  }

  return renderWatchSubjectIcon("workflow");
}

function renderMetadata(row: WatchRowViewModel): string {
  const items: string[] = [];

  items.push(renderWorkflowStatus(row));

  const detail = getMetadataDetail(row);

  if (detail) {
    items.push(`<span class="watch-meta-text">${escapeHtml(detail)}</span>`);
  }

  return items.length > 0 ? `<span class="watch-meta">${items.join(renderMetaSeparator())}</span>` : "";
}

function renderMetaSeparator(): string {
  return `<span class="watch-meta-separator">·</span>`;
}

function renderWorkflowStatus(row: WatchRowViewModel): string {
  return `
    <span class="watch-workflow-status status-icon-${row.tone}">
      ${getStatusIconSvg(row.tone, `${row.id}-workflow`)}
      <span>${escapeHtml(row.statusLabel)}</span>
    </span>
  `;
}

function getMetadataDetail(row: WatchRowViewModel): string | undefined {
  if (row.timingText) {
    return row.timingText;
  }

  return row.tone === "error" ? row.description : undefined;
}

function renderWatchActions(row: WatchRowViewModel): string {
  if (pendingWatchAction?.id === row.id) {
    const isRerun = pendingWatchAction.kind === "rerun";
    const label = isRerun ? "Re-run" : "Remove";
    const action = isRerun ? "confirm-rerun" : "confirm-remove";
    const tone = isRerun ? "rerun" : "remove";

    return `
      <div class="watch-actions">
        <button class="confirm-button confirm-button-${tone}" type="button" data-action="${action}" data-id="${escapeHtml(row.id)}">
          ${label}
        </button>
      </div>
    `;
  }

  return `
    <div class="watch-actions">
      ${
        row.canRerun
          ? `<button class="watch-action-button rerun-button" type="button" data-action="arm-rerun" data-id="${escapeHtml(row.id)}" title="Re-run" aria-label="Re-run ${escapeHtml(row.label)}">
              ${getRerunActionIconSvg()}
            </button>`
          : ""
      }
      <button class="watch-action-button remove-button${row.unseenStatusChange ? " is-unseen" : ""}" type="button" data-action="arm-remove" data-id="${escapeHtml(row.id)}" title="Remove" aria-label="Remove ${escapeHtml(row.label)}">
        <span class="remove-icon" aria-hidden="true">&times;</span>
        ${row.unseenStatusChange ? `<span class="unseen-dot" aria-hidden="true"></span>` : ""}
      </button>
    </div>
  `;
}

function renderStatusIcon(row: WatchRowViewModel, className = "status-icon"): string {
  const icon = getStatusIconSvg(row.tone, row.id);
  return `<span class="${className} status-icon status-icon-${row.tone}" aria-hidden="true">${icon}</span>`;
}

function renderPrStateIcon(
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

function renderWatchSubjectIcon(subject: Exclude<WatchRowViewModel["subject"], "pull-request">): string {
  return `
    <span
      class="watch-leading-icon watch-subject-icon watch-subject-icon-${subject}"
      title="${subject === "job" ? "Workflow job" : "Workflow run"}"
      aria-label="${subject === "job" ? "Workflow job" : "Workflow run"}"
    >
      ${getWatchSubjectIconSvg(subject)}
    </span>
  `;
}

function bindEvents(): void {
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-add"]')) {
    button.addEventListener("click", () => {
      isAdding = !isAdding;
      isClearMenuOpen = false;
      addError = undefined;
      render();
      app.querySelector<HTMLInputElement>('input[name="url"]')?.focus();
    });
  }

  app.querySelector<HTMLFormElement>('[data-role="add-form"]')?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const formData = new FormData(form);
      const url = String(formData.get("url") || "");
      void addWatch(url);
    },
  );

  app.querySelector<HTMLButtonElement>('[data-action="close-add"]')?.addEventListener(
    "click",
    () => {
      isAdding = false;
      addError = undefined;
      render();
    },
  );

  app.querySelector<HTMLButtonElement>('[data-action="toggle-clear-menu"]')?.addEventListener(
    "click",
    () => {
      isClearMenuOpen = !isClearMenuOpen;
      render();
    },
  );

  app.querySelector<HTMLButtonElement>('[data-action="toggle-autostart"]')?.addEventListener(
    "click",
    () => {
      void toggleAutoStart();
    },
  );

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-group"]')) {
    button.addEventListener("click", () => {
      const repoLabel = button.dataset.repo;

      if (repoLabel) {
        collapsedGroups.toggle(repoLabel);
        isClearMenuOpen = false;
        render();
      }
    });
  }

  app.querySelector<HTMLButtonElement>('[data-action="clear-finished"]')?.addEventListener(
    "click",
    () => {
      isClearMenuOpen = false;
      controller.clearFinished();
    },
  );

  app.querySelector<HTMLButtonElement>('[data-action="clear-all"]')?.addEventListener(
    "click",
    () => {
      isClearMenuOpen = false;
      controller.clearAll();
    },
  );

  app.querySelector<HTMLButtonElement>('[data-action="toggle-auto-clear-merged-prs"]')?.addEventListener(
    "click",
    () => {
      settings = {
        ...settings,
        autoClearMergedPrWatches: !settings.autoClearMergedPrWatches,
      };
      controller.setOptions({
        autoClearMergedPrWatches: settings.autoClearMergedPrWatches,
      });
      isClearMenuOpen = false;
      void saveSettings(settings);
      render();
      void poll();
    },
  );

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-favorite-repo"]')) {
    button.addEventListener("click", () => {
      toggleFavoriteRepository({
        owner: button.dataset.owner || "",
        repo: button.dataset.repo || "",
      });
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-active-workflows"]')) {
    button.addEventListener("click", () => {
      void toggleActiveWorkflowRuns({
        owner: button.dataset.owner || "",
        repo: button.dataset.repo || "",
      });
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-favorite-prs"]')) {
    button.addEventListener("click", () => {
      void toggleFavoritePullRequests({
        owner: button.dataset.owner || "",
        repo: button.dataset.repo || "",
      });
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="watch-active-workflow"]')) {
    button.addEventListener("click", () => {
      void watchActiveWorkflowRun({
        owner: button.dataset.owner || "",
        repo: button.dataset.repo || "",
        runId: button.dataset.run || "",
        url: button.dataset.url || "",
      });
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="watch-favorite-pr"]')) {
    button.addEventListener("click", () => {
      void watchFavoritePullRequest({
        owner: button.dataset.owner || "",
        repo: button.dataset.repo || "",
        prNumber: button.dataset.pr || "",
      });
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="arm-remove"]')) {
    button.addEventListener("click", () => {
      armWatchAction(button.dataset.id || "", "remove");
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="arm-rerun"]')) {
    button.addEventListener("click", () => {
      armWatchAction(button.dataset.id || "", "rerun");
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="confirm-remove"]')) {
    button.addEventListener("click", () => {
      pendingWatchAction = undefined;
      controller.remove(button.dataset.id || "");
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="confirm-rerun"]')) {
    button.addEventListener("click", () => {
      void confirmRerun(button.dataset.id || "");
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="open"]')) {
    button.addEventListener("click", () => {
      const id = button.dataset.id || "";
      const watch = controller.getWatches().find((item) => item.id === id);

      if (watch) {
        controller.markSeen(watch.id);
        void openUrl(watch.target.url);
      }
    });
  }
}

function renderClearMenu(hasWatches: boolean, hasFinishedWatches: boolean): string {
  return `
    <div class="clear-menu-popover" role="menu">
      ${getOverflowMenuItems({
        autoClearMergedPrWatches: settings.autoClearMergedPrWatches,
        autoStartEnabled,
        autoStartBusy,
        hasWatches,
        hasFinishedWatches,
      })
        .map(renderClearMenuItem)
        .join("")}
    </div>
  `;
}

function renderClearMenuItem(item: OverflowMenuItem): string {
  const disabled = item.disabled ? "disabled" : "";

  if (item.kind === "checkbox") {
    return `
      <button
        class="menu-checkbox"
        type="button"
        role="menuitemcheckbox"
        aria-checked="${item.checked ? "true" : "false"}"
        data-action="${item.action}"
        ${disabled}
      >
        <span class="menu-checkbox-box is-${item.checkbox}" aria-hidden="true">
          ${item.checked ? renderCheckIcon() : ""}
        </span>
        <span>${escapeHtml(item.label)}</span>
      </button>
    `;
  }

  return `
    <button class="menu-action" type="button" role="menuitem" data-action="${item.action}" ${disabled}>
      ${escapeHtml(item.label)}
    </button>
  `;
}

function renderCheckIcon(): string {
  return `
    <svg viewBox="0 0 16 16">
      <path d="m3.5 8.2 2.8 2.8 6.2-6.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
    </svg>
  `;
}

function toggleFavoriteRepository(repo: Pick<FavoriteRepo, "owner" | "repo">): void {
  if (!repo.owner || !repo.repo) {
    return;
  }

  const wasFavorite = isFavoriteRepo(settings.favoriteRepos, repo);
  let favoriteRepos = toggleFavoriteRepo(settings.favoriteRepos, repo);

  if (!wasFavorite) {
    favoriteRepos = updateFavoriteRepoIcon(favoriteRepos, repo, findRepoIconUrl(repo));
  } else if (favoritePrMenu?.repoKey === getFavoriteRepoKey(repo)) {
    favoritePrMenu = undefined;
  } else if (activeWorkflowRunMenu?.repoKey === getFavoriteRepoKey(repo)) {
    activeWorkflowRunMenu = undefined;
  }

  settings = { ...settings, favoriteRepos };
  void saveSettings(settings);
  render();

  if (!wasFavorite) {
    void refreshFavoriteRepoIcon(repo);
  }
}

async function refreshFavoriteRepoIcon(repo: Pick<FavoriteRepo, "owner" | "repo">): Promise<void> {
  const repoKey = getFavoriteRepoKey(repo);
  const current = settings.favoriteRepos.find((favorite) => getFavoriteRepoKey(favorite) === repoKey);

  if (!current || current.repoIconUrl || isDemoMode) {
    return;
  }

  try {
    const repoIconUrl = await fetchRepositoryIconUrl(repo);
    const favoriteRepos = updateFavoriteRepoIcon(settings.favoriteRepos, repo, repoIconUrl);

    if (favoriteRepos !== settings.favoriteRepos) {
      settings = { ...settings, favoriteRepos };
      await saveSettings(settings);
      render();
    }
  } catch {
    // Missing avatars should not interfere with favorites.
  }
}

function findRepoIconUrl(repo: Pick<FavoriteRepo, "owner" | "repo">): string | undefined {
  return controller
    .getWatches()
    .find((watch) => watch.target.owner === repo.owner && watch.target.repo === repo.repo)?.repoIconUrl;
}

async function toggleFavoritePullRequests(repo: Pick<FavoriteRepo, "owner" | "repo">): Promise<void> {
  if (!repo.owner || !repo.repo) {
    return;
  }

  const repoKey = getFavoriteRepoKey(repo);

  if (favoritePrMenu?.repoKey === repoKey) {
    favoritePrMenu = undefined;
    render();
    return;
  }

  favoritePrMenu = { repoKey, status: "loading" };
  activeWorkflowRunMenu = undefined;
  isClearMenuOpen = false;
  render();

  try {
    const pullRequests = await controller.listOpenPullRequests(repo);

    if (favoritePrMenu?.repoKey === repoKey) {
      favoritePrMenu = { repoKey, status: "loaded", pullRequests };
      render();
    }
  } catch (error) {
    if (favoritePrMenu?.repoKey === repoKey) {
      favoritePrMenu = {
        repoKey,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      render();
    }
  }
}

async function toggleActiveWorkflowRuns(repo: Pick<FavoriteRepo, "owner" | "repo">): Promise<void> {
  if (!repo.owner || !repo.repo) {
    return;
  }

  const repoKey = getFavoriteRepoKey(repo);

  if (activeWorkflowRunMenu?.repoKey === repoKey) {
    activeWorkflowRunMenu = undefined;
    render();
    return;
  }

  activeWorkflowRunMenu = { repoKey, status: "loading" };
  favoritePrMenu = undefined;
  isClearMenuOpen = false;
  render();

  try {
    const runs = await controller.listActiveWorkflowRuns(repo);

    if (activeWorkflowRunMenu?.repoKey === repoKey) {
      activeWorkflowRunMenu = { repoKey, status: "loaded", runs };
      render();
    }
  } catch (error) {
    if (activeWorkflowRunMenu?.repoKey === repoKey) {
      activeWorkflowRunMenu = {
        repoKey,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      render();
    }
  }
}

async function watchActiveWorkflowRun(
  target: Pick<FavoriteRepo, "owner" | "repo"> & { runId: string; url: string },
): Promise<void> {
  if (!target.owner || !target.repo || !target.runId || !target.url) {
    return;
  }

  const repoKey = getFavoriteRepoKey(target);

  try {
    await controller.add({
      kind: "run",
      owner: target.owner,
      repo: target.repo,
      runId: target.runId,
      url: target.url,
    });
    activeWorkflowRunMenu = undefined;
  } catch (error) {
    activeWorkflowRunMenu = {
      repoKey,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  render();
  void updateTrayIndicator();
}

async function watchFavoritePullRequest(
  target: Pick<FavoriteRepo, "owner" | "repo"> & { prNumber: string },
): Promise<void> {
  if (!target.owner || !target.repo || !target.prNumber) {
    return;
  }

  const repoKey = getFavoriteRepoKey(target);

  try {
    await controller.add({
      kind: "pr",
      owner: target.owner,
      repo: target.repo,
      prNumber: target.prNumber,
      url: `https://github.com/${target.owner}/${target.repo}/pull/${target.prNumber}`,
    });
    favoritePrMenu = undefined;
  } catch (error) {
    favoritePrMenu = {
      repoKey,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  render();
  void updateTrayIndicator();
}

function armWatchAction(id: string, kind: PendingWatchAction["kind"]): void {
  if (!id) {
    return;
  }

  pendingWatchAction = { id, kind };
  isClearMenuOpen = false;
  render();
}

async function confirmRerun(id: string): Promise<void> {
  if (!id) {
    return;
  }

  pendingWatchAction = undefined;

  try {
    await controller.rerunFailed(id);
  } catch (error) {
    console.error("Could not re-run failed GitHub Actions jobs.", error);
  }

  render();
  void updateTrayIndicator();
}

async function refreshAutoStartState(): Promise<void> {
  autoStartBusy = true;
  render();

  try {
    autoStartEnabled = await getAutoStartEnabled();
  } catch (error) {
    console.warn("Unable to read Auto-start state", error);
  } finally {
    autoStartBusy = false;
    render();
  }
}

async function toggleAutoStart(): Promise<void> {
  if (autoStartBusy) {
    return;
  }

  autoStartBusy = true;
  render();

  try {
    autoStartEnabled = await setAutoStartEnabled(!autoStartEnabled);
  } catch (error) {
    console.warn("Unable to update Auto-start state", error);
  } finally {
    autoStartBusy = false;
    render();
  }
}

async function hideMainWindow(): Promise<void> {
  try {
    await acknowledgePopupDismissal();
    await getCurrentWindow().hide();
  } catch (error) {
    console.error("Could not hide GHA Watch window.", error);
  }
}

async function acknowledgePopupDismissal(): Promise<void> {
  const dismissedState = dismissPopupUi({
    clearMenuOpen: isClearMenuOpen,
  });
  isClearMenuOpen = dismissedState.clearMenuOpen;
  render();

  if (createTrayState(controller.getWatches()).hasUnseenChanges) {
    controller.markAllSeen();
  }

  try {
    await clearDesktopNotifications();
  } catch (error) {
    console.warn("Could not clear desktop notifications.", error);
  }
}

async function addWatch(url: string): Promise<void> {
  try {
    const target = await parseWatchInput(url);
    await controller.add(target);
    isAdding = false;
    isClearMenuOpen = false;
    addError = undefined;
  } catch (error) {
    addError = error instanceof Error ? error.message : String(error);
  }

  render();
  void updateTrayIndicator();
}

async function parseWatchInput(input: string): Promise<ParsedWatchTarget> {
  if (!isOwnerlessPullRequestSlug(input)) {
    return parseGitHubActionsUrl(input);
  }

  return parseGitHubActionsUrl(input, { defaultOwner: await fetchAuthenticatedUserLogin() });
}

async function poll(): Promise<void> {
  if (isDemoMode) {
    return;
  }

  if (isPolling) {
    return;
  }

  isPolling = true;

  try {
    await controller.pollNow();
  } finally {
    isPolling = false;
  }
}

async function updateTrayIndicator(): Promise<void> {
  const summary = createTrayState(controller.getWatches());
  await setTrayIndicator(summary.status, summary.tooltip, summary.hasUnseenChanges);
}

async function resizePopupToContent(): Promise<void> {
  const nextHeight = calculatePopupHeight(measurePopupContentHeight());

  if (nextHeight === popupHeight) {
    return;
  }

  popupHeight = nextHeight;

  try {
    await getCurrentWindow().setSize(new LogicalSize(popupWidth, nextHeight));
  } catch (error) {
    console.warn("Unable to resize GHA Watch window", error);
  }
}

function measurePopupContentHeight(): number {
  const header = app.querySelector<HTMLElement>(".header");
  const addForm = app.querySelector<HTMLElement>(".add-form");
  const watchList = app.querySelector<HTMLElement>(".watch-list");
  const watchListContentHeight = watchList?.querySelector(".empty")
    ? 0
    : Array.from(watchList?.children ?? []).reduce((height, child) => {
        return height + (child instanceof HTMLElement ? child.offsetHeight : 0);
      }, 0);

  return (header?.offsetHeight ?? 0) + (addForm?.offsetHeight ?? 0) + watchListContentHeight;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchDemoOpenPullRequests(): Promise<OpenPullRequest[]> {
  return [
    {
      number: "12",
      title: "Add favorite repo quick watches",
      isDraft: false,
      updatedAt: "2026-05-17T12:45:00Z",
      url: "https://github.com/getsentry/sentry/pull/12",
    },
    {
      number: "13",
      title: "Refine tray popup spacing",
      isDraft: true,
      updatedAt: "2026-05-17T11:30:00Z",
      url: "https://github.com/getsentry/sentry/pull/13",
    },
  ];
}

async function fetchDemoActiveWorkflowRuns(): Promise<ActiveWorkflowRun[]> {
  return [
    {
      runId: "21",
      title: "CI: Build and test",
      status: "in_progress",
      updatedAt: "2026-05-17T12:50:00Z",
      url: "https://github.com/getsentry/sentry/actions/runs/21",
    },
    {
      runId: "22",
      title: "Release: Package app",
      status: "queued",
      updatedAt: "2026-05-17T12:45:00Z",
      url: "https://github.com/getsentry/sentry/actions/runs/22",
    },
  ];
}

function loadInitialWatches(): WatchRecord[] {
  if (isDemoMode) {
    return [
      createDemoWatch("8", "CI: feat: auto-start", "completed", "success", false, {
        prNumber: "8",
        sourceState: "merged",
      }),
      createDemoWatch("9", "CI: feat: slug", "completed", "success", false, {
        prNumber: "9",
        sourceState: "merged",
      }),
      createDemoWatch("10", "CI: ci: add Rust cache", "completed", "success", false, {
        timing: {
          startedAt: "2026-05-17T09:28:00Z",
          completedAt: "2026-05-17T09:31:00Z",
        },
      }),
      createDemoWatch("11", "Build / package app (macOS)", "in_progress", null, true, {
        jobId: "42",
        timing: {
          startedAt: "2026-05-17T11:56:00Z",
        },
      }),
    ];
  }

  return loadWatches();
}

function createDemoWatch(
  runId: string,
  label: string,
  status: string,
  conclusion: string | null,
  active: boolean,
  options: {
    jobId?: string;
    prNumber?: string;
    sourceState?: WatchRecord["sourceState"];
    timing?: WatchRecord["timing"];
  } = {},
): WatchRecord {
  const target = options.jobId
    ? {
        kind: "job" as const,
        owner: "getsentry",
        repo: "sentry",
        runId,
        jobId: options.jobId,
        ...(options.prNumber ? { prNumber: options.prNumber } : {}),
        url: `https://github.com/getsentry/sentry/actions/runs/${runId}/job/${options.jobId}`,
      }
    : {
        kind: "run" as const,
        owner: "getsentry",
        repo: "sentry",
        runId,
        ...(options.prNumber ? { prNumber: options.prNumber } : {}),
        url: `https://github.com/getsentry/sentry/actions/runs/${runId}`,
      };

  return {
    id: options.jobId ? `getsentry/sentry/job/${options.jobId}` : `getsentry/sentry/run/${runId}`,
    target,
    ...(options.prNumber
      ? {
          source: {
            kind: "pr",
            owner: "getsentry",
            repo: "sentry",
            prNumber: options.prNumber,
            url: `https://github.com/getsentry/sentry/pull/${options.prNumber}`,
          },
        }
      : {}),
    ...(options.sourceState ? { sourceState: options.sourceState } : {}),
    label,
    status: conclusion ? `${status}:${conclusion}` : status,
    lastState: { status, conclusion },
    ...(options.timing ? { timing: options.timing } : {}),
    active,
    error: undefined,
  };
}
