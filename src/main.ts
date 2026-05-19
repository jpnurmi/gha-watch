import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { getRerunActionIconSvg } from "./app/actionIcon";
import { createCollapsedGroups } from "./app/collapsedGroups";
import { renderDragGripIcon, renderWatchLeadingSlot, renderWatchTreeLeadingSlot } from "./app/dragGlyph";
import { getOverflowMenuItems, type OverflowMenuItem } from "./app/overflowMenu";
import { dismissPopupUi } from "./app/popupDismissal";
import { getPopupBodySections, type PopupBodySection } from "./app/popupLayout";
import { replacePopupHtmlPreservingScroll } from "./app/popupScroll";
import { calculatePopupHeight, popupMinHeight, popupWidth } from "./app/popupSize";
import { getPrStateIconSvg } from "./app/prStateIcon";
import { getRepoHeaderActions, type RepoHeaderActions } from "./app/repoHeaderActions";
import {
  didRepoReorderPressMove,
  repoReorderClickSuppressMs,
  repoReorderLongPressMs,
} from "./app/repoReorderInteraction";
import { getStatusIconSvg } from "./app/statusIcon";
import { createWatchController } from "./app/watchController";
import {
  isWatchActionConfirmation,
  shouldDismissPendingWatchActionOnRowLeave,
  type PendingWatchAction,
} from "./app/watchActionConfirmation";
import { getClickedUnseenWatchIds } from "./app/watchSeenAction";
import {
  canRemoveWatchTreeNode,
  getWatchTreeNodeRemoveMode,
  shouldDismissPendingTreeActionOnHeaderLeave,
  type PendingWatchTreeAction,
  type WatchTreeNodeRemoveMode,
} from "./app/watchTreeActions";
import { createTrayState } from "./app/trayState";
import {
  createPopupViewModel,
  type RowTone,
  type WatchGroupViewModel,
  type WatchRowViewModel,
  type WatchTreeNodeViewModel,
} from "./app/viewModel";
import { getWatchSubjectIconSvg } from "./app/watchSubjectIcon";
import type { WatchNotification } from "./app/watchNotification";
import {
  addFavoriteRepo,
  getFavoriteRepoKey,
  isFavoriteRepo,
  toggleFavoriteRepo,
  updateFavoriteRepoIcon,
  type FavoriteRepo,
} from "./domain/favorites";
import {
  isOwnerlessPullRequestSlug,
  isOwnerlessRepositorySlug,
  parseGitHubActionsUrl,
  type ParsedGitHubTarget,
} from "./domain/githubUrl";
import {
  getRepoDropTarget,
  moveRepoKey,
  type RepoDropCandidate,
  type RepoDropPosition,
  type RepoDropTarget,
} from "./domain/repoOrder";
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
  resolveRunWatchTargets,
} from "./platform/gh";
import { clearDesktopNotifications, listenForDesktopNotificationClicks, sendDesktopNotification } from "./platform/notifications";
import { getAutoStartEnabled, setAutoStartEnabled } from "./platform/autostart";
import { loadSettings, loadWatches, saveSettings, saveWatches } from "./platform/store";
import { setTrayIndicator } from "./platform/tray";
import "./styles.css";

const pollIntervalMs = 30_000;
const treeIndentStepPx = 26;
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
let isPopupOpen = false;
let autoStartEnabled = false;
let autoStartBusy = true;
let popupHeight = popupMinHeight;
const collapsedGroups = createCollapsedGroups();
let pendingWatchAction: PendingWatchAction | undefined;
let pendingTreeAction: PendingWatchTreeAction | undefined;
let pendingRepoAction: PendingRepoAction | undefined;
let activeWorkflowRunMenu: ActiveWorkflowRunMenuState | undefined;
let favoritePrMenu: FavoritePullRequestMenuState | undefined;
let repoPressState: RepoPressState | undefined;
let repoDragState: RepoDragState | undefined;
let watchPressState: WatchPressState | undefined;
let watchDragState: WatchDragState | undefined;
let suppressedRepoToggleKey: string | undefined;
let suppressedRepoToggleUntilMs = 0;
let suppressedTreeToggleKey: string | undefined;
let suppressedTreeToggleUntilMs = 0;
let suppressedWatchOpenId: string | undefined;
let suppressedWatchOpenUntilMs = 0;
let settings = loadSettings();

type RepoDragState = {
  sourceKey: string;
};

type RepoPressState = {
  sourceKey: string;
  startX: number;
  startY: number;
  timeoutId: number;
};

type WatchDragState = {
  repoKey: string;
  sourceKey: string;
  sourceIds: string[];
};

type WatchPressState = WatchDragState & {
  startX: number;
  startY: number;
  timeoutId: number;
};

type WatchReorderTarget = {
  repoKey: string;
  key: string;
  rowIds: string[];
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

type PendingRepoAction = {
  owner: string;
  repo: string;
  repoLabel: string;
  rowIds: string[];
  removeFavorite: boolean;
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
    notificationsPaused: () => isPopupOpen,
    notify: notifyStatusChange,
    resolvePrWatchTargets: isDemoMode ? async () => ({ targets: [], sourceState: "ready" }) : resolvePrWatchTargets,
    resolveRunWatchTargets: isDemoMode ? async () => ({ targets: [] }) : resolveRunWatchTargets,
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
    if (!pendingWatchAction && !pendingTreeAction && !pendingRepoAction) {
      return;
    }

    const target = event.target;
    const actionTarget = target instanceof Element ? target.closest<HTMLElement>("[data-action]") : null;
    const action = actionTarget?.dataset.action;

    if (isWatchActionConfirmation(action) || action === "confirm-remove-group" || action === "confirm-remove-repo") {
      return;
    }

    pendingWatchAction = undefined;
    pendingTreeAction = undefined;
    pendingRepoAction = undefined;
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
    if (repoPressState || repoDragState || watchPressState || watchDragState) {
      cancelRepoPointerDrag();
      cancelWatchPointerDrag();
      event.preventDefault();
      return;
    }

    void hideMainWindow();
  }
});
void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
  isPopupOpen = focused;

  if (!focused) {
    void acknowledgePopupDismissal();
  }
});

function render(): void {
  const watches = controller.getWatches();
  const viewModel = createPopupViewModel(watches, new Date(), settings.favoriteRepos, settings.repoOrder);
  const hasWatches = watches.length > 0;
  const hasFinishedWatches = watches.some((watch) => !watch.active);

  replacePopupHtmlPreservingScroll(app, `
    <section class="shell">
      <header class="header">
        <div>
          <h1 class="header-title is-${viewModel.headerTone}">${escapeHtml(viewModel.title)}</h1>
          <p>${escapeHtml(viewModel.subtitle)}</p>
        </div>
        <div class="header-actions">
          <button class="icon-button" type="button" data-action="toggle-add" title="Add" aria-label="Add repository or watch">
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
  `);

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
                <button class="empty-action" type="button" data-action="toggle-add">Add</button>
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
        <button class="add-form-dismiss" type="button" data-action="close-add" title="Cancel" aria-label="Cancel adding">
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
          aria-label="GitHub repository, Actions URL, or pull request slug"
          aria-describedby="add-form-hint"
        />
        <div class="add-field-actions">
          <button class="add-form-submit" type="submit">Add</button>
        </div>
      </div>
      <p class="form-hint" id="add-form-hint">or https://github.com/OWNER/REPO/actions/runs/RUN_ID</p>
      ${addError ? `<p class="form-error">${escapeHtml(addError)}</p>` : ""}
    </form>
  `;
}

function renderWatchGroup(group: WatchGroupViewModel): string {
  const actions = getRepoHeaderActions({
    favorite: group.favorite,
    userCollapsed: collapsedGroups.has(group.repoLabel),
    watchCount: group.rows.length,
  });
  const isCollapsed = actions.isCollapsed;
  const collapseDisabled = actions.canToggleCollapse ? "" : `aria-disabled="true" data-disabled="true"`;

  return `
    <li
      class="watch-group${isCollapsed ? " is-collapsed" : ""}"
      data-repo="${escapeHtml(group.repoLabel)}"
    >
      <div class="watch-group-header">
        ${renderRepoGroupChevron(group, actions, isCollapsed)}
        ${renderFavoriteRepoButton(group)}
        <button
          class="watch-group-toggle"
          type="button"
          data-action="toggle-group"
          data-repo="${escapeHtml(group.repoLabel)}"
          aria-expanded="${isCollapsed ? "false" : "true"}"
          ${collapseDisabled}
        >
          <span class="watch-group-meta">
            <span class="watch-group-title">${escapeHtml(group.repoLabel)}</span>
          </span>
        </button>
        ${renderRepoGroupActions(group, actions)}
      </div>
      ${
        isCollapsed || group.rows.length === 0
          ? ""
          : `<ul class="watch-group-list">
              ${group.items.map((item) => renderWatchGroupItem(item)).join("")}
            </ul>`
      }
    </li>
  `;
}

function renderWatchGroupItem(item: WatchGroupViewModel["items"][number]): string {
  return item.kind === "tree" ? renderWatchTreeNode(item.node, 0) : renderWatch(item.row, 0);
}

function renderRepoGroupChevron(
  group: WatchGroupViewModel,
  actions: RepoHeaderActions,
  isCollapsed: boolean,
): string {
  const collapseDisabled = actions.canToggleCollapse ? "" : `aria-disabled="true" data-disabled="true"`;

  return `
    <button
      class="watch-tree-chevron watch-group-toggle-chevron"
      type="button"
      data-action="toggle-group"
      data-repo="${escapeHtml(group.repoLabel)}"
      title="${isCollapsed ? "Expand" : "Collapse"}"
      aria-label="${isCollapsed ? "Expand" : "Collapse"} ${escapeHtml(group.repoLabel)}"
      aria-expanded="${isCollapsed ? "false" : "true"}"
      ${collapseDisabled}
    >
      ${renderChevronIcon(isCollapsed)}
    </button>
  `;
}

function renderRepoGroupActions(group: WatchGroupViewModel, actions: RepoHeaderActions): string {
  if (pendingRepoAction?.repoLabel === group.repoLabel) {
    return `
      <div class="watch-group-actions has-confirmation">
        <button
          class="watch-group-confirm-button confirm-button confirm-button-remove"
          type="button"
          data-action="confirm-remove-repo"
          data-owner="${escapeHtml(group.owner)}"
          data-repo="${escapeHtml(group.repo)}"
          data-row-ids="${escapeHtml(group.rows.map((row) => row.id).join("\n"))}"
          data-remove-favorite="${group.favorite ? "true" : "false"}"
        >
          Remove
        </button>
      </div>
    `;
  }

  const canRemove = group.rows.length > 0 || group.favorite;

  return `
    <div class="watch-group-actions">
      ${actions.showOpenPullRequests ? renderFavoritePullRequestMenu(group) : ""}
      ${actions.showActiveWorkflowRuns ? renderActiveWorkflowRunMenu(group) : ""}
      ${
        canRemove
          ? `<button
              class="watch-group-remove-button remove-button"
              type="button"
              data-action="arm-remove-repo"
              data-owner="${escapeHtml(group.owner)}"
              data-repo="${escapeHtml(group.repo)}"
              data-repo-label="${escapeHtml(group.repoLabel)}"
              data-row-ids="${escapeHtml(group.rows.map((row) => row.id).join("\n"))}"
              data-remove-favorite="${group.favorite ? "true" : "false"}"
              title="Remove"
              aria-label="Remove ${escapeHtml(group.repoLabel)}"
            >
              <span class="remove-icon" aria-hidden="true">&times;</span>
            </button>`
          : ""
      }
    </div>
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
      <span class="watch-group-drag-glyph" aria-hidden="true">
        ${renderDragGripIcon()}
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

function renderWatchTreeNode(node: WatchTreeNodeViewModel, depth: number): string {
  const hasVisibleChildren = node.children.length > 0 || node.rows.length > 0;
  const isCollapsed = hasVisibleChildren && collapsedGroups.has(node.id);
  const actionLabel = hasVisibleChildren ? `${isCollapsed ? "Expand" : "Collapse"} ${node.label}` : node.label;
  const treeToggleAttributes = hasVisibleChildren
    ? `
          data-action="toggle-tree-node"
          data-tree-node="${escapeHtml(node.id)}"
          aria-expanded="${isCollapsed ? "false" : "true"}"`
    : "";
  const canRemove = canRemoveWatchTreeNode(node, depth);
  const hasActions = canRemove || Boolean(node.url);
  const children = !hasVisibleChildren || isCollapsed
    ? ""
    : `
      <ul class="watch-tree-children">
        ${node.children.map((child) => renderWatchTreeNode(child, depth + 1)).join("")}
        ${node.rows.map((row) => renderWatch(row, depth + 1)).join("")}
      </ul>
    `;

  return `
    <li
      class="watch-tree-node watch-tree-node-${node.kind}${isCollapsed ? " is-collapsed" : ""}"
      data-tree-node="${escapeHtml(node.id)}"
      data-reorder-key="${escapeHtml(node.id)}"
      data-row-ids="${escapeHtml(node.rowIds.join("\n"))}"
      style="--tree-indent: ${depth * treeIndentStepPx}px;"
    >
      <div class="watch-tree-header is-${node.tone}${hasActions ? " has-actions" : ""}">
        ${renderWatchTreeChevron(node, hasVisibleChildren, isCollapsed)}
        ${renderWatchTreeLeading(node, depth, actionLabel, treeToggleAttributes, isCollapsed)}
        <button
          class="watch-tree-main"
          type="button"
          title="${escapeHtml(actionLabel)}"
          aria-label="${escapeHtml(actionLabel)}"
          ${treeToggleAttributes}
        >
          <span class="watch-label">
            <span class="watch-title-text">${escapeHtml(node.label)}</span>
            ${node.referenceLabel ? `<span class="watch-title-reference">${escapeHtml(node.referenceLabel)}</span>` : ""}
          </span>
          ${renderWatchTreeMetadata(node)}
        </button>
        ${renderWatchTreeActions(node, depth)}
      </div>
      ${children}
    </li>
  `;
}

function renderWatchTreeLeading(
  node: WatchTreeNodeViewModel,
  depth: number,
  actionLabel: string,
  treeToggleAttributes: string,
  isCollapsed: boolean,
): string {
  const className = `watch-tree-leading${depth === 0 ? " is-top-level" : ""}`;
  const showUnseenIndicator = shouldShowWatchTreeUnseenIndicator(node, isCollapsed);
  const leadingSlot = renderWatchTreeLeadingSlot(
    renderWatchTreeLeadingIcon(node),
    showUnseenIndicator ? renderUnseenDot() : "",
  );

  if (showUnseenIndicator) {
    return `
      <button
        class="${className}"
        type="button"
        data-action="mark-seen"
        data-row-ids="${escapeHtml(node.rowIds.join("\n"))}"
        title="Mark seen"
        aria-label="Mark ${escapeHtml(node.label)} seen"
      >
        ${leadingSlot}
      </button>
    `;
  }

  return `
    <button
      class="${className}"
      type="button"
      title="${escapeHtml(actionLabel)}"
      aria-label="${escapeHtml(actionLabel)}"
      ${treeToggleAttributes}
    >
      ${leadingSlot}
    </button>
  `;
}

function shouldShowWatchTreeUnseenIndicator(node: WatchTreeNodeViewModel, isCollapsed: boolean): boolean {
  if (!node.unseenStatusChange) {
    return false;
  }

  const hasVisibleChildren = node.children.length > 0 || node.rows.length > 0;

  return isCollapsed || !hasVisibleChildren || !hasVisibleUnseenDescendantIndicator(node);
}

function hasVisibleUnseenDescendantIndicator(node: WatchTreeNodeViewModel): boolean {
  if (node.rows.some((row) => row.unseenStatusChange)) {
    return true;
  }

  return node.children.some((child) => {
    const childHasVisibleChildren = child.children.length > 0 || child.rows.length > 0;
    const childIsCollapsed = childHasVisibleChildren && collapsedGroups.has(child.id);

    return shouldShowWatchTreeUnseenIndicator(child, childIsCollapsed) ||
      (!childIsCollapsed && hasVisibleUnseenDescendantIndicator(child));
  });
}

function renderWatchTreeChevron(
  node: WatchTreeNodeViewModel,
  hasVisibleChildren: boolean,
  isCollapsed: boolean,
): string {
  if (!hasVisibleChildren) {
    return `<span class="watch-tree-chevron-spacer" aria-hidden="true"></span>`;
  }

  return `
    <button
      class="watch-tree-chevron"
      type="button"
      data-action="toggle-tree-node"
      data-tree-node="${escapeHtml(node.id)}"
      title="${isCollapsed ? "Expand" : "Collapse"} ${escapeHtml(node.label)}"
      aria-label="${isCollapsed ? "Expand" : "Collapse"} ${escapeHtml(node.label)}"
      aria-expanded="${isCollapsed ? "false" : "true"}"
    >
      ${renderChevronIcon(isCollapsed)}
    </button>
  `;
}

function renderWatchTreeLeadingIcon(node: WatchTreeNodeViewModel): string {
  if (node.kind === "pull-request" && node.prState) {
    return renderPrStateIcon(node.prState, "watch-tree-leading-icon");
  }

  return renderWatchSubjectIcon("workflow", "watch-tree-leading-icon");
}

function renderWatchTreeMetadata(node: WatchTreeNodeViewModel): string {
  const items = [renderWorkflowStatusIcon(node.id, node.tone, node.statusLabel)];
  const detail = [node.timingText, node.detailLabel].filter((item): item is string => Boolean(item)).join(" · ");

  if (detail) {
    items.push(`<span class="watch-meta-text">${escapeHtml(detail)}</span>`);
  }

  return `<span class="watch-meta">${items.join(renderMetaSeparator())}</span>`;
}

function renderWatchTreeActions(node: WatchTreeNodeViewModel, depth: number): string {
  const canRemove = canRemoveWatchTreeNode(node, depth);

  if (!canRemove && !node.url) {
    return "";
  }

  const removeMode = getWatchTreeNodeRemoveMode(node, depth);

  if (pendingTreeAction?.nodeId === node.id) {
    return `
      <div class="watch-tree-actions">
        <button
          class="watch-tree-confirm-button confirm-button confirm-button-remove"
          type="button"
          data-action="confirm-remove-group"
          data-tree-node="${escapeHtml(node.id)}"
          data-remove-mode="${removeMode ?? "remove"}"
          data-row-ids="${escapeHtml(node.rowIds.join("\n"))}"
        >
          Remove
        </button>
      </div>
    `;
  }

  return `
    <div class="watch-tree-actions">
      ${node.url ? renderOpenLinkButton("watch-tree-action-button open-link-button", node.label, node.url, node.kind === "workflow" ? node.primaryRowId : undefined) : ""}
      ${
        canRemove
          ? `<button
              class="watch-tree-action-button remove-button"
              type="button"
              data-action="arm-remove-group"
              data-tree-node="${escapeHtml(node.id)}"
              data-remove-mode="${removeMode ?? "remove"}"
              data-row-ids="${escapeHtml(node.rowIds.join("\n"))}"
              title="Remove"
              aria-label="Remove ${escapeHtml(node.label)}"
            >
              <span class="remove-icon" aria-hidden="true">&times;</span>
            </button>`
          : ""
      }
    </div>
  `;
}

function renderOpenLinkButton(className: string, label: string, url: string, id?: string): string {
  return `
    <button
      class="${className}"
      type="button"
      data-action="open"
      ${id ? `data-id="${escapeHtml(id)}"` : ""}
      data-url="${escapeHtml(url)}"
      title="Open"
      aria-label="Open ${escapeHtml(label)} in GitHub"
    >
      ${renderOpenLinkIcon()}
    </button>
  `;
}

function renderWatch(row: WatchRowViewModel, depth = 0): string {
  const hasConfirmation = pendingWatchAction?.id === row.id;

  return `
    <li
      class="watch is-${row.tone}${row.prState ? " has-pr-state" : ""}${row.unseenStatusChange ? " has-unseen-change" : ""}${hasConfirmation ? " has-confirmation" : ""}"
      data-id="${escapeHtml(row.id)}"
      data-reorder-key="${escapeHtml(row.id)}"
      data-row-ids="${escapeHtml(row.id)}"
      style="--watch-indent: ${depth * treeIndentStepPx}px;"
    >
      ${renderLeadingIcon(row)}
      <div class="watch-main">
        <span class="watch-label">
          <span class="watch-title-text">${escapeHtml(row.label)}</span>
          ${row.prReference ? `<span class="watch-title-reference">${escapeHtml(row.prReference)}</span>` : ""}
        </span>
        ${renderMetadata(row)}
      </div>
      ${renderWatchActions(row)}
    </li>
  `;
}

function renderLeadingIcon(row: WatchRowViewModel): string {
  const markSeenOverlay = row.unseenStatusChange ? renderWatchSeenOverlay(row) : "";

  if (row.subject === "job") {
    return renderWatchLeadingSlot(renderWatchSubjectIcon("job"), markSeenOverlay);
  }

  return renderWatchLeadingSlot(renderWatchSubjectIcon("workflow"), markSeenOverlay);
}

function renderWatchSeenOverlay(row: WatchRowViewModel): string {
  return `
    <button class="watch-leading-seen-button" type="button" data-action="mark-seen" data-id="${escapeHtml(row.id)}" title="Mark seen" aria-label="Mark ${escapeHtml(row.label)} seen">
      ${renderUnseenDot()}
    </button>
  `;
}

function renderUnseenDot(): string {
  return `<span class="unseen-dot" aria-hidden="true"></span>`;
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
  return renderWorkflowStatusIcon(row.id, row.tone, row.statusLabel);
}

function renderWorkflowStatusIcon(id: string, tone: RowTone, statusLabel: string): string {
  return `
    <span class="watch-workflow-status status-icon-${tone}">
      ${getStatusIconSvg(tone, `${id}-workflow`)}
      <span>${escapeHtml(statusLabel)}</span>
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
    const isPrWorkflowIgnore = pendingWatchAction.kind === "ignore-pr-workflow";
    const label = isRerun ? "Re-run" : "Remove";
    const action = isRerun ? "confirm-rerun" : isPrWorkflowIgnore ? "confirm-ignore-pr-workflow" : "confirm-remove";
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
      ${renderOpenLinkButton("watch-action-button open-link-button", row.label, row.url, row.id)}
      <button class="watch-action-button remove-button" type="button" data-action="${row.removeMode === "ignore-pr-workflow" ? "arm-ignore-pr-workflow" : "arm-remove"}" data-id="${escapeHtml(row.id)}" title="Remove" aria-label="Remove ${escapeHtml(row.label)}">
        <span class="remove-icon" aria-hidden="true">&times;</span>
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

function renderWatchSubjectIcon(
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
    button.addEventListener("click", (event) => {
      const repoLabel = button.dataset.repo;

      if (repoLabel && consumeSuppressedRepoToggle(repoLabel)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (repoLabel) {
        toggleRepoGroup(repoLabel);
      }
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-tree-node"]')) {
    button.addEventListener("click", (event) => {
      const nodeId = button.dataset.treeNode;

      if (nodeId) {
        if (consumeSuppressedTreeToggle(nodeId)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        toggleTreeNode(nodeId);
      }
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="arm-remove-group"]')) {
    button.addEventListener("click", () => {
      armTreeNodeRemoval(button.dataset.treeNode || "", getTreeNodeRowIds(button), getTreeNodeRemoveMode(button));
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="confirm-remove-group"]')) {
    button.addEventListener("click", () => {
      removeTreeNodeWatches(getTreeNodeRowIds(button), getTreeNodeRemoveMode(button));
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="arm-remove-repo"]')) {
    button.addEventListener("click", () => {
      armRepoGroupRemoval(button);
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="confirm-remove-repo"]')) {
    button.addEventListener("click", () => {
      removeRepoGroupWatches(button);
    });
  }

  for (const header of app.querySelectorAll<HTMLElement>(".watch-tree-header")) {
    header.addEventListener("mouseleave", () => {
      dismissTreeActionOnHeaderLeave(header.closest<HTMLElement>(".watch-tree-node")?.dataset.treeNode);
    });
  }

  for (const header of app.querySelectorAll<HTMLElement>(".watch-group-header")) {
    header.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest('[data-action="toggle-group"]')) {
        return;
      }

      const repoLabel = getRepoHeaderPressKey(header, event);

      if (!repoLabel) {
        return;
      }

      if (consumeSuppressedRepoToggle(repoLabel)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      toggleRepoGroup(repoLabel);
    });
    header.addEventListener("mouseleave", () => {
      dismissRepoActionOnHeaderLeave(header.closest<HTMLElement>(".watch-group[data-repo]")?.dataset.repo);
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

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="arm-ignore-pr-workflow"]')) {
    button.addEventListener("click", () => {
      armWatchAction(button.dataset.id || "", "ignore-pr-workflow");
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

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="confirm-ignore-pr-workflow"]')) {
    button.addEventListener("click", () => {
      pendingWatchAction = undefined;
      controller.ignorePrWorkflow(button.dataset.id || "");
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="confirm-rerun"]')) {
    button.addEventListener("click", () => {
      void confirmRerun(button.dataset.id || "");
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="mark-seen"]')) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const ids = getClickedUnseenWatchIds(controller.getWatches(), button.dataset.id, getTreeNodeRowIds(button));

      for (const id of ids) {
        controller.markSeen(id);
      }
    });
  }

  for (const row of app.querySelectorAll<HTMLElement>(".watch")) {
    row.addEventListener("mouseleave", () => {
      dismissWatchActionOnRowLeave(row.dataset.id);
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="open"]')) {
    button.addEventListener("click", (event) => {
      const id = button.dataset.id || "";
      const explicitUrl = button.dataset.url || "";

      if (id && consumeSuppressedWatchOpen(id)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const watch = controller.getWatches().find((item) => item.id === id);

      if (watch) {
        controller.markSeen(watch.id);
        void openUrl(explicitUrl || watch.target.url);
      } else if (explicitUrl) {
        void openUrl(explicitUrl);
      }
    });
  }

  bindRepoReorderEvents();
  bindWatchReorderEvents();
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

function renderOpenLinkIcon(): string {
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.25 4.25h-2.5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 1.5 1.5h6.5a1.5 1.5 0 0 0 1.5-1.5v-2.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/>
      <path d="M8.5 2.25h5.25V7.5m-.5-4.75-6.5 6.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/>
    </svg>
  `;
}

function bindRepoReorderEvents(): void {
  for (const header of app.querySelectorAll<HTMLElement>(".watch-group-header")) {
    header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      const repoKey = getRepoHeaderPressKey(header, event);

      if (!repoKey || getVisibleRepoOrder().length < 2) {
        return;
      }

      cancelRepoPointerDrag();
      cancelWatchPointerDrag();
      repoPressState = {
        sourceKey: repoKey,
        startX: event.clientX,
        startY: event.clientY,
        timeoutId: window.setTimeout(() => {
          startRepoPointerDrag(repoKey);
        }, repoReorderLongPressMs),
      };
      document.addEventListener("pointermove", updateRepoPointerDrag);
      document.addEventListener("pointerup", finishRepoPointerDrag, { once: true });
      document.addEventListener("pointercancel", cancelRepoPointerDrag, { once: true });
    });
  }
}

function bindWatchReorderEvents(): void {
  for (const row of app.querySelectorAll<HTMLElement>(".watch[data-id]")) {
    row.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      const target = getWatchRowPressTarget(row, event);

      if (!target || getVisibleWatchReorderOrder(target.key).length < 2) {
        return;
      }

      cancelWatchPointerDrag();
      cancelRepoPointerDrag();
      watchPressState = {
        repoKey: target.repoKey,
        sourceKey: target.key,
        sourceIds: target.rowIds,
        startX: event.clientX,
        startY: event.clientY,
        timeoutId: window.setTimeout(() => {
          startWatchPointerDrag(target.repoKey, target.key, target.rowIds);
        }, repoReorderLongPressMs),
      };
      document.addEventListener("pointermove", updateWatchPointerDrag);
      document.addEventListener("pointerup", finishWatchPointerDrag, { once: true });
      document.addEventListener("pointercancel", cancelWatchPointerDrag, { once: true });
    });
  }

  for (const header of app.querySelectorAll<HTMLElement>(".watch-tree-header")) {
    header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      const target = getWatchTreePressTarget(header, event);

      if (!target || getVisibleWatchReorderOrder(target.key).length < 2) {
        return;
      }

      cancelWatchPointerDrag();
      cancelRepoPointerDrag();
      watchPressState = {
        repoKey: target.repoKey,
        sourceKey: target.key,
        sourceIds: target.rowIds,
        startX: event.clientX,
        startY: event.clientY,
        timeoutId: window.setTimeout(() => {
          startWatchPointerDrag(target.repoKey, target.key, target.rowIds);
        }, repoReorderLongPressMs),
      };
      document.addEventListener("pointermove", updateWatchPointerDrag);
      document.addEventListener("pointerup", finishWatchPointerDrag, { once: true });
      document.addEventListener("pointercancel", cancelWatchPointerDrag, { once: true });
    });
  }
}

function getRepoHeaderPressKey(header: HTMLElement, event: Event): string | undefined {
  if (!(event.target instanceof Element)) {
    return undefined;
  }

  if (event.target.closest(".watch-group-star, .watch-group-actions, .repo-action-menu, .watch-group-toggle-chevron")) {
    return undefined;
  }

  return header.closest<HTMLElement>(".watch-group[data-repo]")?.dataset.repo;
}

function getWatchRowPressTarget(
  row: HTMLElement,
  event: Event,
): WatchReorderTarget | undefined {
  if (!(event.target instanceof Element)) {
    return undefined;
  }

  if (event.target.closest('.watch-actions, [data-action="mark-seen"]')) {
    return undefined;
  }

  const key = row.dataset.reorderKey;
  const rowIds = getWatchReorderRowIds(row);
  const repoKey = row.closest<HTMLElement>(".watch-group[data-repo]")?.dataset.repo;

  return key && repoKey && rowIds.length > 0 ? { repoKey, key, rowIds } : undefined;
}

function getWatchTreePressTarget(
  header: HTMLElement,
  event: Event,
): WatchReorderTarget | undefined {
  if (!(event.target instanceof Element)) {
    return undefined;
  }

  if (event.target.closest('.watch-tree-actions, .watch-tree-chevron, [data-action="mark-seen"]')) {
    return undefined;
  }

  const node = header.closest<HTMLElement>(".watch-tree-node[data-reorder-key]");
  const key = node?.dataset.reorderKey;
  const rowIds = node ? getWatchReorderRowIds(node) : [];
  const repoKey = header.closest<HTMLElement>(".watch-group[data-repo]")?.dataset.repo;

  return key && repoKey && rowIds.length > 0 ? { repoKey, key, rowIds } : undefined;
}

function getWatchReorderRowIds(element: HTMLElement): string[] {
  return (element.dataset.rowIds || "")
    .split("\n")
    .map((rowId) => rowId.trim())
    .filter((rowId) => rowId.length > 0);
}

function toggleRepoGroup(repoLabel: string): void {
  const groupToggle = getRepoGroupElement(repoLabel)?.querySelector<HTMLElement>('[data-action="toggle-group"]');

  if (groupToggle?.dataset.disabled === "true") {
    return;
  }

  collapsedGroups.toggle(repoLabel);
  isClearMenuOpen = false;
  pendingRepoAction = undefined;
  render();
}

function toggleTreeNode(nodeId: string): void {
  collapsedGroups.toggle(nodeId);
  isClearMenuOpen = false;
  pendingRepoAction = undefined;
  activeWorkflowRunMenu = undefined;
  favoritePrMenu = undefined;
  render();
}

function armTreeNodeRemoval(nodeId: string, rowIds: string[], mode: WatchTreeNodeRemoveMode): void {
  if (!nodeId || rowIds.length === 0) {
    return;
  }

  pendingTreeAction = { mode, nodeId, rowIds };
  pendingWatchAction = undefined;
  pendingRepoAction = undefined;
  isClearMenuOpen = false;
  activeWorkflowRunMenu = undefined;
  favoritePrMenu = undefined;
  render();
}

function armRepoGroupRemoval(button: HTMLButtonElement): void {
  const repoLabel = button.dataset.repoLabel || "";

  if (!repoLabel) {
    return;
  }

  pendingRepoAction = {
    owner: button.dataset.owner || "",
    repo: button.dataset.repo || "",
    repoLabel,
    rowIds: getTreeNodeRowIds(button),
    removeFavorite: button.dataset.removeFavorite === "true",
  };
  pendingWatchAction = undefined;
  pendingTreeAction = undefined;
  isClearMenuOpen = false;
  activeWorkflowRunMenu = undefined;
  favoritePrMenu = undefined;
  render();
}

function dismissTreeActionOnHeaderLeave(nodeId: string | undefined): void {
  if (!shouldDismissPendingTreeActionOnHeaderLeave(pendingTreeAction, nodeId)) {
    return;
  }

  pendingTreeAction = undefined;
  render();
}

function dismissRepoActionOnHeaderLeave(repoLabel: string | undefined): void {
  if (!pendingRepoAction || pendingRepoAction.repoLabel !== repoLabel) {
    return;
  }

  pendingRepoAction = undefined;
  render();
}

function removeTreeNodeWatches(rowIds: string[], mode: WatchTreeNodeRemoveMode): void {
  pendingTreeAction = undefined;

  if (mode === "ignore-pr-workflow") {
    controller.ignorePrWorkflow(rowIds[0] || "");
    return;
  }

  for (const rowId of rowIds) {
    if (controller.getWatches().some((watch) => watch.id === rowId)) {
      controller.remove(rowId);
    }
  }
}

function removeRepoGroupWatches(button: HTMLButtonElement): void {
  pendingRepoAction = undefined;

  for (const rowId of getTreeNodeRowIds(button)) {
    if (controller.getWatches().some((watch) => watch.id === rowId)) {
      controller.remove(rowId);
    }
  }

  if (button.dataset.removeFavorite === "true") {
    const repo = {
      owner: button.dataset.owner || "",
      repo: button.dataset.repo || "",
    };

    if (isFavoriteRepo(settings.favoriteRepos, repo)) {
      const repoKey = getFavoriteRepoKey(repo);

      settings = {
        ...settings,
        favoriteRepos: settings.favoriteRepos.filter((favorite) => getFavoriteRepoKey(favorite) !== repoKey),
      };
      void saveSettings(settings);
      render();
    }
  }
}

function getTreeNodeRemoveMode(button: HTMLButtonElement): WatchTreeNodeRemoveMode {
  return button.dataset.removeMode === "ignore-pr-workflow" ? "ignore-pr-workflow" : "remove";
}

function getTreeNodeRowIds(button: HTMLButtonElement): string[] {
  return (button.dataset.rowIds || "")
    .split("\n")
    .map((rowId) => rowId.trim())
    .filter((rowId) => rowId.length > 0);
}

function startWatchPointerDrag(repoKey: string, sourceKey: string, sourceIds: string[]): void {
  if (!watchPressState || watchPressState.repoKey !== repoKey || watchPressState.sourceKey !== sourceKey) {
    return;
  }

  watchPressState = undefined;
  watchDragState = { repoKey, sourceKey, sourceIds };
  isClearMenuOpen = false;
  activeWorkflowRunMenu = undefined;
  favoritePrMenu = undefined;

  app.querySelector(".watch-list")?.classList.add("is-reordering-runs");
  getWatchReorderElement(sourceKey)?.parentElement?.classList.add("is-reordering-runs");
  getWatchReorderElement(sourceKey)?.classList.add("is-row-dragging");
}

function startRepoPointerDrag(sourceKey: string): void {
  if (!repoPressState || repoPressState.sourceKey !== sourceKey) {
    return;
  }

  repoPressState = undefined;
  repoDragState = { sourceKey };
  isClearMenuOpen = false;
  activeWorkflowRunMenu = undefined;
  favoritePrMenu = undefined;

  app.querySelector(".watch-list")?.classList.add("is-reordering");
  getRepoGroupElement(sourceKey)?.classList.add("is-dragging");
}

function updateRepoPointerDrag(event: PointerEvent): void {
  if (repoPressState) {
    if (
      didRepoReorderPressMove({
        startX: repoPressState.startX,
        startY: repoPressState.startY,
        clientX: event.clientX,
        clientY: event.clientY,
      })
    ) {
      cancelRepoPointerDrag();
    }

    return;
  }

  if (!repoDragState) {
    return;
  }

  event.preventDefault();
  showRepoDropIndicator(getPointerRepoDropTarget(event.clientY));
}

function updateWatchPointerDrag(event: PointerEvent): void {
  if (watchPressState) {
    if (
      didRepoReorderPressMove({
        startX: watchPressState.startX,
        startY: watchPressState.startY,
        clientX: event.clientX,
        clientY: event.clientY,
      })
    ) {
      cancelWatchPointerDrag();
    }

    return;
  }

  if (!watchDragState) {
    return;
  }

  event.preventDefault();
  showWatchDropIndicator(getPointerWatchDropTarget(event.clientY));
}

function finishRepoPointerDrag(event: PointerEvent): void {
  if (repoPressState) {
    cancelRepoPointerDrag();
    return;
  }

  if (!repoDragState) {
    return;
  }

  event.preventDefault();
  const sourceKey = repoDragState.sourceKey;
  const target = getPointerRepoDropTarget(event.clientY);

  repoDragState = undefined;
  suppressNextRepoToggle(sourceKey);
  document.removeEventListener("pointermove", updateRepoPointerDrag);
  document.removeEventListener("pointercancel", cancelRepoPointerDrag);
  clearRepoDragStateClasses();

  if (target) {
    reorderRepos(sourceKey, target.targetKey, target.position);
  }
}

function finishWatchPointerDrag(event: PointerEvent): void {
  if (watchPressState) {
    cancelWatchPointerDrag();
    return;
  }

  if (!watchDragState) {
    return;
  }

  event.preventDefault();
  const sourceKey = watchDragState.sourceKey;
  const sourceIds = watchDragState.sourceIds;
  const target = getPointerWatchDropTarget(event.clientY);
  const targetIds = target ? getWatchReorderTargetIds(target.targetKey) : [];
  const sourceElement = getWatchReorderElement(sourceKey);

  watchDragState = undefined;
  if (sourceElement?.classList.contains("watch-tree-node")) {
    suppressNextTreeToggle(sourceKey);
  } else {
    suppressNextWatchOpen(sourceIds[0] || "");
  }
  document.removeEventListener("pointermove", updateWatchPointerDrag);
  document.removeEventListener("pointercancel", cancelWatchPointerDrag);
  clearWatchDragStateClasses();

  if (target && targetIds.length > 0) {
    reorderWatchesWithinRepo(sourceIds, targetIds, target.position);
  }
}

function cancelRepoPointerDrag(): void {
  if (repoPressState) {
    window.clearTimeout(repoPressState.timeoutId);
  }

  repoPressState = undefined;
  repoDragState = undefined;
  clearSuppressedRepoToggle();
  document.removeEventListener("pointermove", updateRepoPointerDrag);
  document.removeEventListener("pointerup", finishRepoPointerDrag);
  document.removeEventListener("pointercancel", cancelRepoPointerDrag);
  clearRepoDragStateClasses();
}

function cancelWatchPointerDrag(): void {
  if (watchPressState) {
    window.clearTimeout(watchPressState.timeoutId);
  }

  watchPressState = undefined;
  watchDragState = undefined;
  clearSuppressedTreeToggle();
  clearSuppressedWatchOpen();
  document.removeEventListener("pointermove", updateWatchPointerDrag);
  document.removeEventListener("pointerup", finishWatchPointerDrag);
  document.removeEventListener("pointercancel", cancelWatchPointerDrag);
  clearWatchDragStateClasses();
}

function suppressNextRepoToggle(repoKey: string): void {
  suppressedRepoToggleKey = repoKey;
  suppressedRepoToggleUntilMs = window.performance.now() + repoReorderClickSuppressMs;
}

function suppressNextTreeToggle(nodeId: string): void {
  suppressedTreeToggleKey = nodeId;
  suppressedTreeToggleUntilMs = window.performance.now() + repoReorderClickSuppressMs;
}

function suppressNextWatchOpen(watchId: string): void {
  suppressedWatchOpenId = watchId;
  suppressedWatchOpenUntilMs = window.performance.now() + repoReorderClickSuppressMs;
}

function consumeSuppressedRepoToggle(repoKey: string): boolean {
  if (!suppressedRepoToggleKey) {
    return false;
  }

  if (window.performance.now() > suppressedRepoToggleUntilMs) {
    clearSuppressedRepoToggle();
    return false;
  }

  if (suppressedRepoToggleKey !== repoKey) {
    return false;
  }

  clearSuppressedRepoToggle();
  return true;
}

function consumeSuppressedTreeToggle(nodeId: string): boolean {
  if (!suppressedTreeToggleKey) {
    return false;
  }

  if (window.performance.now() > suppressedTreeToggleUntilMs) {
    clearSuppressedTreeToggle();
    return false;
  }

  if (suppressedTreeToggleKey !== nodeId) {
    return false;
  }

  clearSuppressedTreeToggle();
  return true;
}

function consumeSuppressedWatchOpen(watchId: string): boolean {
  if (!suppressedWatchOpenId) {
    return false;
  }

  if (window.performance.now() > suppressedWatchOpenUntilMs) {
    clearSuppressedWatchOpen();
    return false;
  }

  if (suppressedWatchOpenId !== watchId) {
    return false;
  }

  clearSuppressedWatchOpen();
  return true;
}

function clearSuppressedRepoToggle(): void {
  suppressedRepoToggleKey = undefined;
  suppressedRepoToggleUntilMs = 0;
}

function clearSuppressedTreeToggle(): void {
  suppressedTreeToggleKey = undefined;
  suppressedTreeToggleUntilMs = 0;
}

function clearSuppressedWatchOpen(): void {
  suppressedWatchOpenId = undefined;
  suppressedWatchOpenUntilMs = 0;
}

function getPointerRepoDropTarget(clientY: number): RepoDropTarget | undefined {
  if (!repoDragState) {
    return undefined;
  }

  return getRepoDropTarget(getVisibleRepoDropCandidates(), repoDragState.sourceKey, clientY);
}

function getPointerWatchDropTarget(clientY: number): RepoDropTarget | undefined {
  if (!watchDragState) {
    return undefined;
  }

  return getRepoDropTarget(
    getVisibleWatchDropCandidates(watchDragState.sourceKey),
    watchDragState.sourceKey,
    clientY,
  );
}

function getVisibleRepoDropCandidates(): RepoDropCandidate[] {
  return Array.from(app.querySelectorAll<HTMLElement>(".watch-group[data-repo]"))
    .map((groupElement) => {
      const key = groupElement.dataset.repo;
      const rect = groupElement.getBoundingClientRect();

      return key
        ? {
            key,
            top: rect.top,
            height: rect.height,
          }
        : undefined;
    })
    .filter((candidate): candidate is RepoDropCandidate => Boolean(candidate));
}

function getVisibleWatchDropCandidates(sourceKey: string): RepoDropCandidate[] {
  const sourceElement = getWatchReorderElement(sourceKey);
  const container = sourceElement?.parentElement;

  if (!container) {
    return [];
  }

  return getWatchReorderElements(container)
    .map((element) => {
      const key = element.dataset.reorderKey;
      const rect = element.getBoundingClientRect();

      return key
        ? {
            key,
            top: rect.top,
            height: rect.height,
          }
        : undefined;
    })
    .filter((candidate): candidate is RepoDropCandidate => Boolean(candidate));
}

function showRepoDropIndicator(target: RepoDropTarget | undefined): void {
  clearRepoDropIndicators();

  if (!target) {
    return;
  }

  getRepoGroupElement(target.targetKey)?.classList.add(
    target.position === "before" ? "is-drop-before" : "is-drop-after",
  );
}

function showWatchDropIndicator(target: RepoDropTarget | undefined): void {
  clearWatchDropIndicators();

  if (!target) {
    return;
  }

  getWatchReorderElement(target.targetKey)?.classList.add(
    target.position === "before" ? "is-row-drop-before" : "is-row-drop-after",
  );
}

function clearRepoDropIndicators(): void {
  for (const groupElement of app.querySelectorAll(".watch-group")) {
    groupElement.classList.remove("is-drop-before", "is-drop-after");
  }
}

function clearWatchDropIndicators(): void {
  for (const rowElement of app.querySelectorAll(".watch")) {
    rowElement.classList.remove("is-row-drop-before", "is-row-drop-after");
  }

  for (const treeElement of app.querySelectorAll(".watch-tree-node")) {
    treeElement.classList.remove("is-row-drop-before", "is-row-drop-after");
  }
}

function clearRepoDragStateClasses(): void {
  app.querySelector(".watch-list")?.classList.remove("is-reordering");

  for (const groupElement of app.querySelectorAll(".watch-group")) {
    groupElement.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
  }
}

function clearWatchDragStateClasses(): void {
  app.querySelector(".watch-list")?.classList.remove("is-reordering-runs");

  for (const groupList of app.querySelectorAll(".watch-group-list, .watch-tree-children")) {
    groupList.classList.remove("is-reordering-runs");
  }

  for (const rowElement of app.querySelectorAll(".watch")) {
    rowElement.classList.remove("is-row-dragging", "is-row-drop-before", "is-row-drop-after");
  }

  for (const treeElement of app.querySelectorAll(".watch-tree-node")) {
    treeElement.classList.remove("is-row-dragging", "is-row-drop-before", "is-row-drop-after");
  }
}

function reorderRepos(sourceKey: string, targetKey: string, position: RepoDropPosition): void {
  const visibleRepoOrder = getVisibleRepoOrder();
  const repoOrder = moveRepoKey(visibleRepoOrder, sourceKey, targetKey, position);

  repoDragState = undefined;
  clearRepoDragStateClasses();

  if (repoOrder === visibleRepoOrder || repoOrdersAreEqual(repoOrder, settings.repoOrder)) {
    return;
  }

  settings = { ...settings, repoOrder };
  void saveSettings(settings);
  render();
}

function reorderWatchesWithinRepo(sourceIds: string[], targetIds: string[], position: RepoDropPosition): void {
  controller.reorderGroupWithinRepo(sourceIds, targetIds, position);
}

function getVisibleRepoOrder(): string[] {
  return Array.from(app.querySelectorAll<HTMLElement>(".watch-group[data-repo]"))
    .map((groupElement) => groupElement.dataset.repo)
    .filter((repoKey): repoKey is string => Boolean(repoKey));
}

function getVisibleWatchReorderOrder(sourceKey: string): string[] {
  const sourceElement = getWatchReorderElement(sourceKey);
  const container = sourceElement?.parentElement;

  if (!container) {
    return [];
  }

  return getWatchReorderElements(container)
    .map((element) => element.dataset.reorderKey)
    .filter((key): key is string => Boolean(key));
}

function getRepoGroupElement(repoKey: string): HTMLElement | undefined {
  return Array.from(app.querySelectorAll<HTMLElement>(".watch-group[data-repo]"))
    .find((groupElement) => groupElement.dataset.repo === repoKey);
}

function getWatchReorderElements(container: Element): HTMLElement[] {
  return Array.from(container.children).filter((element): element is HTMLElement => {
    return element instanceof HTMLElement && Boolean(element.dataset.reorderKey);
  });
}

function getWatchReorderElement(key: string): HTMLElement | undefined {
  return Array.from(app.querySelectorAll<HTMLElement>("[data-reorder-key]"))
    .find((element) => element.dataset.reorderKey === key);
}

function getWatchReorderTargetIds(key: string): string[] {
  const element = getWatchReorderElement(key);
  return element ? getWatchReorderRowIds(element) : [];
}

function repoOrdersAreEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((repoKey, index) => repoKey === right[index]);
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

async function addFavoriteRepository(repo: Pick<FavoriteRepo, "owner" | "repo">): Promise<void> {
  let favoriteRepos = addFavoriteRepo(settings.favoriteRepos, repo);
  favoriteRepos = updateFavoriteRepoIcon(favoriteRepos, repo, findRepoIconUrl(repo));

  if (favoriteRepos !== settings.favoriteRepos) {
    settings = { ...settings, favoriteRepos };
    await saveSettings(settings);
  }

  void refreshFavoriteRepoIcon(repo);
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
  pendingTreeAction = undefined;
  pendingRepoAction = undefined;
  isClearMenuOpen = false;
  render();
}

function dismissWatchActionOnRowLeave(rowId: string | undefined): void {
  if (!shouldDismissPendingWatchActionOnRowLeave(pendingWatchAction, rowId)) {
    return;
  }

  pendingWatchAction = undefined;
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
  cancelRepoPointerDrag();
  cancelWatchPointerDrag();
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

    if (target.kind === "repo") {
      await addFavoriteRepository(target);
    } else {
      await controller.add(target);
    }

    isAdding = false;
    isClearMenuOpen = false;
    addError = undefined;
  } catch (error) {
    addError = error instanceof Error ? error.message : String(error);
  }

  render();
  void updateTrayIndicator();
}

async function parseWatchInput(input: string): Promise<ParsedGitHubTarget> {
  if (!isOwnerlessPullRequestSlug(input) && !isOwnerlessRepositorySlug(input)) {
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
        runTitle: "feat: auto-start",
        workflowName: "CI",
        prNumber: "8",
        sourceState: "merged",
      }),
      createDemoWatch("9", "CI: feat: slug", "completed", "success", false, {
        runTitle: "feat: slug",
        workflowName: "CI",
        prNumber: "9",
        sourceState: "merged",
      }),
      createDemoWatch("10", "CI: ci: add Rust cache", "completed", "success", false, {
        runTitle: "ci: add Rust cache",
        workflowName: "CI",
        timing: {
          startedAt: "2026-05-17T09:28:00Z",
          completedAt: "2026-05-17T09:31:00Z",
        },
      }),
      createDemoWatch("11", "Build / package app (macOS)", "in_progress", null, true, {
        jobId: "42",
        jobName: "package app (macOS)",
        workflowName: "Build",
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
    jobName?: string;
    prNumber?: string;
    runTitle?: string;
    sourceState?: WatchRecord["sourceState"];
    timing?: WatchRecord["timing"];
    workflowName?: string;
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
    metadata: {
      ...(options.workflowName ? { workflowName: options.workflowName } : {}),
      ...(options.runTitle ? { runTitle: options.runTitle } : {}),
      ...(options.jobName ? { jobName: options.jobName } : {}),
    },
    status: conclusion ? `${status}:${conclusion}` : status,
    lastState: { status, conclusion },
    ...(options.timing ? { timing: options.timing } : {}),
    active,
    error: undefined,
  };
}
