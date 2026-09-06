import { getWatchSubjectIconSvg } from "./app/watchSubjectIcon";
import { renderWatch } from "./ui/watchRow";
import { renderAddForm, type PullRequestDiscoveryState } from "./ui/addPanel";
import { renderRepositorySettings, type RepositoryWatchMenuState } from "./ui/repositorySettings";
import { escapeHtml, renderBranchBadge, renderChevronIcon, renderTriageButtons } from "./ui/markup";
import { createSettingsJournal } from "./platform/settingsJournal";
import { invokeDesktop } from "./platform/desktop";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { createAdaptivePollingCoordinator } from "./app/adaptivePolling";
import { createCollapsedGroups } from "./app/collapsedGroups";
import {
  createDesktopNotificationActionHandler,
  createDesktopNotificationActionQueue,
} from "./app/desktopNotificationActions";
import { createAuthenticatedUserLoginProvider } from "./app/authenticatedUser";
import { getFreshnessState } from "./app/freshness";
import { getRefreshHealth } from "./app/refreshHealth";
import { createApplicationSession } from "./app/applicationSession";
import { createRepositoryIconProvider } from "./app/repositoryIcon";
import {
  getRepoCiStatusAfterRefreshError,
  shouldRefreshRepoCiStatus,
  shouldRefreshRepoCiWorkflows,
} from "./app/repoCiRefresh";
import { getOverflowMenuItems, type OverflowMenuItem } from "./app/overflowMenu";
import { dismissPopupUi } from "./app/popupDismissal";
import { getPopupBodySections, type PopupBodySection } from "./app/popupLayout";
import { replacePopupHtmlPreservingScroll } from "./app/popupScroll";
import { calculatePopupHeight, popupMinHeight, popupWidth } from "./app/popupSize";
import {
  getPullRequestDiscoveryId,
  getUnwatchedPullRequests,
} from "./app/pullRequestDiscovery";
import { getRepoHeaderActions, type RepoHeaderActions } from "./app/repoHeaderActions";
import {
  didRepoReorderPressMove,
  repoReorderLongPressMs,
} from "./app/repoReorderInteraction";
import { renderTitleMarkup } from "./app/titleMarkup";
import { createWatchController, type WatchPollResult } from "./app/watchController";
import {
  getWatchRerunMode,
  shouldDismissPendingWatchActionOnRowLeave,
  type PendingWatchAction,
} from "./app/watchActionConfirmation";
import { getClickedUnseenWatchIds } from "./app/watchSeenAction";
import { getRepositoryUrl } from "./app/watchLinks";
import {
  formatWatchViewCount,
  getWatchViewAriaLabel,
  getWatchViewCounts,
  type WatchViewCounts,
} from "./app/watchViewCounts";
import { createTrayState } from "./app/trayState";
import { createUpdateCheckCoordinator } from "./app/updateCheck";
import {
  createPopupViewModel,
  type RepoCiStatusViewModel,
  type RepoCiWorkflowStatusViewModel,
  type WatchGroupViewModel,
} from "./app/viewModel";
import type { WatchNotification } from "./app/watchNotification";
import { createSettingsSync } from "./app/settingsSync";
import {
  addWatchedWorkflowTarget,
  addWatchedRepo,
  getWatchedRepoKey,
  getWatchedWorkflowTargetKey,
  isWatchedRepo,
  removeWatchedWorkflowTarget,
  toggleWatchedPullRequestScope,
  toggleWatchedWorkflowSubscription,
  updateWatchedRepoIcon,
  type WatchedPullRequestScope,
  type WatchedRepo,
  type WatchedWorkflowTargetKind,
} from "./domain/watchedRepos";
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
import {
  getWatchTriageState,
  type WatchRecord,
  type WatchTriageState,
} from "./domain/watches";
import {
  fetchActiveWorkflowRuns,
  fetchAuthoredOpenPullRequests,
  fetchAuthenticatedUserLogin,
  fetchOpenPullRequests,
  fetchOpenPullRequestsWithChecks,
  fetchPullRequestDetails,
  fetchRateLimit,
  fetchRepositoryCommitSha,
  fetchRepositoryDefaultBranchCiStatus,
  fetchRepositoryDefaultBranch,
  fetchRepositoryIconUrl,
  fetchUserActiveWorkflowRuns,
  fetchWatchState,
  fetchWorkflowDefinitions,
  fetchWorkflowRunsSince,
  isRepositoryCommitAncestor,
  rerunWatch,
  type ActiveWorkflowRun,
  type AuthoredOpenPullRequest,
  type OpenPullRequest,
  type RateLimit,
  type RerunMode,
  type RepositoryCiStatus,
  type WorkflowDefinition,
} from "./platform/gh";
import { clearDesktopNotifications, listenForDesktopNotificationActions, sendDesktopNotification } from "./platform/notifications";
import { getAutoStartEnabled, setAutoStartEnabled } from "./platform/autostart";
import { getBuildSha } from "./platform/build";
import {
  loadSettings,
  loadWatches,
  loadWatchSuppressions,
  loadWorkflowDiscoveryState,
  saveSettings,
  saveWatches,
  saveWatchSuppressions,
  saveWorkflowDiscoveryState,
} from "./platform/store";
import { createSettingsGistRemote } from "./platform/settingsGist";
import { setTrayIndicator } from "./platform/tray";
import "./styles.css";

const rerunRefreshDelayMs = 1_000;
const updateRepository = { owner: "jpnurmi", repo: "gha-watch" } as const;
const appRoot = document.querySelector<HTMLDivElement>("#app");
document.documentElement.dataset.platform = getUiPlatform(navigator.userAgent);

if (!appRoot) {
  throw new Error("App root was not found.");
}

function getUiPlatform(userAgent: string): string {
  if (/\bWindows\b/i.test(userAgent)) {
    return "windows";
  }

  if (/\bLinux\b/i.test(userAgent)) {
    return "linux";
  }

  return "default";
}

const app = appRoot;
const isDemoMode =
  window.location.hostname === "127.0.0.1" &&
  new URLSearchParams(window.location.search).get("demo") === "checks";
const getAuthenticatedUserLogin = createAuthenticatedUserLoginProvider(
  isDemoMode ? async () => "jpnurmi" : fetchAuthenticatedUserLogin,
);
const getRepositoryIconUrl = createRepositoryIconProvider(
  isDemoMode ? async () => undefined : fetchRepositoryIconUrl,
);
let isAdding = false;
let addError: string | undefined;
let pullRequestDiscovery: PullRequestDiscoveryState = { status: "idle" };
let isPolling = false;
let isClearMenuOpen = false;
let isPopupOpen = false;
let autoStartEnabled = false;
let autoStartBusy = true;
let updateAvailable = false;
let popupHeight = popupMinHeight;
const collapsedGroups = createCollapsedGroups();
let pendingWatchAction: PendingWatchAction | undefined;
let currentWatchView: WatchTriageState = "inbox";
let activeWorkflowRunMenu: ActiveWorkflowRunMenuState | undefined;
let pullRequestMenu: PullRequestMenuState | undefined;
let repositoryWatchMenu: RepositoryWatchMenuState | undefined;
let repoCiStatusMenu: RepoCiStatusMenuState | undefined;
let repoPressState: RepoPressState | undefined;
let repoDragState: RepoDragState | undefined;
let watchPressState: WatchPressState | undefined;
let watchDragState: WatchDragState | undefined;
let rateLimit: RateLimit | undefined;
let lastSuccessfulRefreshAt: Date | undefined;
let lastRefreshFailed = false;
let lastRefreshDegraded = false;
let settings = loadSettings();
const settingsSync = createSettingsSync(createSettingsGistRemote(), createSettingsJournal());
let repoCiStatuses: Record<string, RepoCiStatusViewModel> = {};
const repoCiStatusRefreshes = new Set<string>();
const repoCiStatusUpdatedAt = new Map<string, number>();
const repoCiWorkflowsUpdatedAt = new Map<string, number>();
const repoDefaultBranches = new Map<string, string>();
const repoDefaultBranchRefreshes = new Map<string, Promise<string>>();

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

type PullRequestMenuState =
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

type RepoCiStatusMenuState = {
  repoKey: string;
};

const desktopNotificationActionQueue = createDesktopNotificationActionQueue((error) => {
  console.error("Could not process a desktop notification action.", error);
});
void listenForDesktopNotificationActions(desktopNotificationActionQueue.receive);

const controller = createWatchController(
  {
    fetchState: isDemoMode
      ? async () => {
          throw new Error("Demo mode does not poll GitHub.");
        }
      : (target, options) => fetchWatchState(target, undefined, options),
    fetchActiveWorkflowRuns: isDemoMode ? fetchDemoActiveWorkflowRuns : fetchActiveWorkflowRuns,
    fetchOpenPullRequests: isDemoMode ? fetchDemoOpenPullRequests : fetchOpenPullRequests,
    fetchOpenPullRequestsWithChecks: isDemoMode
      ? fetchDemoOpenPullRequests
      : fetchOpenPullRequestsWithChecks,
    fetchPullRequestDetails: isDemoMode
      ? async (targets) => targets.map(() => ({ state: "ready" as const, title: "Demo pull request" }))
      : fetchPullRequestDetails,
    fetchRepositoryDefaultBranch: getCachedRepositoryDefaultBranch,
    fetchRepositoryIconUrl: getRepositoryIconUrl,
    getAuthenticatedUserLogin,
    fetchUserActiveWorkflowRuns: isDemoMode
      ? fetchDemoUserActiveWorkflowRuns
      : async (target) => fetchUserActiveWorkflowRuns(target, await getAuthenticatedUserLogin()),
    fetchWorkflowDefinitions: isDemoMode ? fetchDemoWorkflowDefinitions : fetchWorkflowDefinitions,
    fetchWorkflowRunsSince: isDemoMode ? undefined : fetchWorkflowRunsSince,
    notificationsPaused: () => isPopupOpen,
    notify: notifyStatusChange,
    rerun: isDemoMode ? async () => undefined : rerunWatch,
    save: saveWatches,
    saveSuppressions: saveWatchSuppressions,
    saveWorkflowDiscoveryState,
  },
  loadInitialWatches(),
  isDemoMode ? [] : loadWatchSuppressions(),
  isDemoMode ? undefined : loadWorkflowDiscoveryState(),
);
const polling = createAdaptivePollingCoordinator({
  clearTimeout: window.clearTimeout.bind(window),
  hasActiveWatches: () => controller.getWatches().some(
    (watch) => getWatchTriageState(watch) === "inbox" && watch.active,
  ),
  poll: (mode) => {
    void refreshSettingsAndStatuses(mode === "full" ? currentWatchView : undefined);
  },
  setTimeout: window.setTimeout.bind(window),
});
const session = createApplicationSession<WatchTriageState>({
  sync: settingsSync,
  enabled: !isDemoMode,
  getState: getLocalSyncedState,
  async applySettings(nextSettings) {
    settings = nextSettings;
    await saveSettings(nextSettings);
  },
  applyWatches(state) {
    controller.replaceSyncedWatches(state.watches, state.watchSuppressions);
  },
  onSynced() {
    render();
    for (const watchedRepo of settings.watchedRepos) {
      void refreshWatchedRepoIcon(watchedRepo);
    }
    void controller.refreshRepositoryIcons();
  },
  reportError: (message, error) => console.warn(message, error),
  poll,
  onRefreshingChanged(refreshing) {
    isPolling = refreshing;
    render();
  },
  onSettled() {
    polling.scheduleNext();
    render();
  },
});

const updateCheck = createUpdateCheckCoordinator({
  clearTimeout: window.clearTimeout.bind(window),
  async fetchLatestSha() {
    const defaultBranch = await fetchRepositoryDefaultBranch(updateRepository);

    return fetchRepositoryCommitSha(updateRepository, defaultBranch);
  },
  getBuildSha,
  isAncestor(ancestorSha, descendantSha) {
    return isRepositoryCommitAncestor(updateRepository, ancestorSha, descendantSha);
  },
  now: Date.now,
  onAvailabilityChanged(available) {
    updateAvailable = available;
    render();
    void updateTrayIndicator();
  },
  reportError(error) {
    console.warn("Unable to check for GHA Watch updates", error);
  },
  setTimeout: window.setTimeout.bind(window),
});

function notifyStatusChange(notification: WatchNotification): Promise<void> {
  return sendDesktopNotification(notification);
}

const handleDesktopNotificationAction = createDesktopNotificationActionHandler({
  controller,
  clearNotifications: clearDesktopNotifications,
  openUrl: openExternalUrl,
  queueSync: queueSyncedStateUpload,
  refreshAfterRerun: queueRerunRefresh,
  async refreshStaleWatch(watch) {
    const triageState = getWatchTriageState(watch);

    if (triageState === "done") {
      return;
    }

    await controller.pollNow({
      watchIds: [watch.id],
      includeInactive: true,
      triageState,
    });
  },
  reportError(message, error) {
    console.error(message, error);
  },
});
void desktopNotificationActionQueue.start(handleDesktopNotificationAction);

controller.subscribe(() => {
  render();
  void updateTrayIndicator();
  void refreshListedRepositoryCiStatuses();
  polling.scheduleNext();
});

render();
void updateTrayIndicator();
void refreshAutoStartState();
void controller.refreshRepositoryIcons();
void refreshListedRepositoryCiStatuses();
polling.scheduleNext();
if (!isDemoMode) {
  updateCheck.start();
}
void refreshSettingsAndStatuses();
document.addEventListener("click", (event) => {
  const target = event.target;

  if (isClearMenuOpen) {
    if (target instanceof Element && target.closest(".clear-menu")) {
      return;
    }

    isClearMenuOpen = false;
    render();
  }

  if (pendingWatchAction || activeWorkflowRunMenu || pullRequestMenu || repositoryWatchMenu || repoCiStatusMenu) {
    if (target instanceof Element && target.closest(".repo-action-menu")) {
      return;
    }

    pendingWatchAction = undefined;
    activeWorkflowRunMenu = undefined;
    pullRequestMenu = undefined;
    repositoryWatchMenu = undefined;
    repoCiStatusMenu = undefined;
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

    if (pendingWatchAction) {
      pendingWatchAction = undefined;
      render();
      event.preventDefault();
      return;
    }

    void hideMainWindow();
  }
});
void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
  isPopupOpen = focused;
  polling.handleFocusChanged(focused);

  if (focused) {
    render();
    void refreshListedRepositoryCiStatuses();
  } else {
    void acknowledgePopupDismissal();
  }
});

function renderRateLimitBar(): string {
  const usedPct = rateLimit ? Math.round((rateLimit.used / rateLimit.limit) * 100) : 0;
  const remainingPct = 100 - usedPct;
  const title = rateLimit
    ? `GitHub API: ${String(rateLimit.remaining)} of ${String(rateLimit.limit)} remaining`
    : "";

  return `<div class="rate-limit-bar" title="${title}">
    <div class="rate-limit-bar-cover" style="width:${remainingPct}%"></div>
  </div>`;
}

function getRateLimitTone(remaining: number): "critical" | "low" | "normal" {
  if (remaining < 100) {
    return "critical";
  }

  if (remaining < 1000) {
    return "low";
  }

  return "normal";
}

function renderRateLimitIndicator(): string {
  if (!rateLimit) {
    return "";
  }

  const remaining = rateLimit.remaining;
  const tone = getRateLimitTone(remaining);
  const resetTime = new Date(rateLimit.reset * 1000);
  const resetHours = String(resetTime.getHours()).padStart(2, "0");
  const resetMinutes = String(resetTime.getMinutes()).padStart(2, "0");
  const resetFormatted = `${resetHours}:${resetMinutes}`;
  const title = `GitHub API rate limit: ${String(rateLimit.used)} / ${String(rateLimit.limit)} used · resets ${resetFormatted}`;

  return `<span class="rate-limit-indicator is-${tone}" title="${title}">
    ${String(rateLimit.used)} / ${String(rateLimit.limit)} &middot; ${resetFormatted}
  </span>`;
}

function renderFreshnessIndicator(): string {
  const freshness = getFreshnessState({
    isRefreshing: isPolling,
    lastRefreshFailed: lastRefreshFailed || lastRefreshDegraded,
    lastUpdatedAt: lastSuccessfulRefreshAt?.getTime(),
    now: Date.now(),
    staleAfterMs: polling.getIntervalMs() * 2,
  });
  const refreshTitle = lastSuccessfulRefreshAt
    ? `Last updated at ${lastSuccessfulRefreshAt.toLocaleTimeString()}${lastRefreshFailed ? ". Latest refresh failed." : lastRefreshDegraded ? ". Latest refresh partially failed." : ""}`
    : lastRefreshFailed
      ? "No successful update. Latest refresh failed."
      : "Waiting for the first update.";

  return `<span class="freshness-indicator${freshness.stale ? " is-stale" : ""}" title="${escapeHtml(refreshTitle)}">
    ${freshness.label}
  </span>`;
}

function render(): void {
  const allWatches = controller.getWatches();
  const watchViewCounts = getWatchViewCounts(allWatches);
  const watches = allWatches.filter((watch) => getWatchTriageState(watch) === currentWatchView);
  const showRepositoryTools = currentWatchView === "inbox";
  const viewModel = createPopupViewModel(
    watches,
    new Date(),
    showRepositoryTools ? settings.watchedRepos : [],
    settings.repoOrder,
    showRepositoryTools ? repoCiStatuses : {},
  );
  const hasWatches = watches.length > 0;
  const hasFinishedWatches = currentWatchView !== "done" && watches.some((watch) => !watch.active);

  replacePopupHtmlPreservingScroll(app, `
    <section class="shell">
      <header class="header">
        ${updateAvailable ? `<span class="update-available-label">Update available</span>` : ""}
        <div class="header-row">
          <div class="header-brand">
            <h1 class="header-title">GHA Watch</h1>
            <div class="header-freshness">
              <button
                class="icon-button refresh-button"
                type="button"
                data-action="refresh"
                title="${isPolling ? "Refreshing" : "Refresh"}"
                aria-label="Refresh status"
                aria-busy="${isPolling ? "true" : "false"}"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M13.4 10A5.5 5.5 0 1 1 13.25 5.75l2.1-2.8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/>
                </svg>
              </button>
              ${renderFreshnessIndicator()}
            </div>
          </div>
          ${renderWatchViewSwitcher(watchViewCounts)}
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
          ${renderRateLimitIndicator()}
        </div>
        ${renderRateLimitBar()}
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
    return renderAddForm(pullRequestDiscovery, getDiscoveredUnwatchedPullRequests(), addError);
  }

  return renderWatchList(viewModel);
}

function renderWatchList(viewModel: ReturnType<typeof createPopupViewModel>): string {
  const emptyState = {
    inbox: { label: "Inbox is clear", showAdd: true },
    saved: { label: "No saved watches", showAdd: false },
    done: { label: "Nothing marked done", showAdd: false },
  }[currentWatchView];

  return `
    <ul class="watch-list">
      ${
        viewModel.groups.length === 0
          ? `<li class="empty">
              <div class="empty-content">
                <span class="empty-label">${emptyState.label}</span>
                ${emptyState.showAdd ? `<button class="empty-action" type="button" data-action="toggle-add">Add</button>` : ""}
              </div>
            </li>`
          : viewModel.groups.map(renderWatchGroup).join("")
      }
    </ul>
  `;
}

function renderWatchViewSwitcher(counts: WatchViewCounts): string {
  const views: Array<{ label: string; state: WatchTriageState }> = [
    { label: "Inbox", state: "inbox" },
    { label: "Saved", state: "saved" },
    { label: "Done", state: "done" },
  ];

  return `
    <div class="watch-view-switcher" role="tablist" aria-label="Watch view">
      ${views
        .map(
          ({ label, state }) => {
            const count = counts[state];
            const hasUnseenInboxItems = state === "inbox" && count.unseen > 0;

            return `
            <button
              class="watch-view-button${currentWatchView === state ? " is-active" : ""}${hasUnseenInboxItems ? " has-unseen-items" : ""}"
              type="button"
              role="tab"
              data-action="select-watch-view"
              data-watch-view="${state}"
              aria-selected="${currentWatchView === state ? "true" : "false"}"
              aria-label="${getWatchViewAriaLabel(state, count)}"
            >
              <span class="watch-view-label" aria-hidden="true">${label}</span>
              ${
                count.total > 0
                  ? `<span class="watch-view-count" aria-hidden="true">${formatWatchViewCount(count.total)}</span>`
                  : ""
              }
            </button>
          `;
          },
        )
        .join("")}
    </div>
  `;
}

function renderWatchGroup(group: WatchGroupViewModel): string {
  const actions = getRepoHeaderActions({
    userCollapsed: collapsedGroups.has(getWatchedRepoKey(group)),
  });
  const isCollapsed = actions.isCollapsed;

  return `
    <li
      class="watch-group${isCollapsed ? " is-collapsed" : ""}"
      data-repo="${escapeHtml(getWatchedRepoKey(group))}"
    >
      <div class="watch-group-header">
        ${renderRepoGroupChevron(group, isCollapsed)}
        ${renderRepositorySettings(group, { currentWatchView, repositoryWatchMenu, watchedRepos: settings.watchedRepos, renderRepoIcon })}
        <span class="watch-group-meta">
          <button
            class="watch-group-link"
            type="button"
            data-action="open-github-url"
            data-url="${escapeHtml(getRepositoryUrl(group))}"
            title="Open ${escapeHtml(group.repoLabel)} on GitHub"
            aria-label="Open ${escapeHtml(group.repoLabel)} on GitHub"
          >
            <span class="watch-group-title">${escapeHtml(group.repoLabel)}</span>
          </button>
          ${renderRepoCiStatus(group)}
        </span>
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
  return renderWatch(item.row, pendingWatchAction);
}

function renderRepoCiStatus(group: WatchGroupViewModel): string {
  if (!group.ciStatus) {
    return "";
  }

  const repoKey = getWatchedRepoKey(group);
  const menuOpen = repoCiStatusMenu?.repoKey === repoKey;
  const content = `
    ${renderRepoCiStatusGlyph(group.ciStatus.tone)}
  `;
  const attributes = `
    class="repo-ci-status is-${group.ciStatus.tone}"
    title="${escapeHtml(group.ciStatus.description)}"
    aria-label="${escapeHtml(group.ciStatus.label)}"
  `;

  if (group.ciStatus.workflows.length > 0) {
    return `
      <span class="repo-action-menu repo-ci-menu">
        <button
          ${attributes}
          type="button"
          data-action="toggle-repo-ci-status"
          data-repo="${escapeHtml(repoKey)}"
          aria-haspopup="menu"
          aria-expanded="${menuOpen ? "true" : "false"}"
        >
          ${content}
        </button>
        ${menuOpen ? renderRepoCiStatusPopover(group.ciStatus) : ""}
      </span>
    `;
  }

  return `
    <span
      ${attributes}
    >
      ${content}
    </span>
  `;
}

function renderRepoCiStatusPopover(status: RepoCiStatusViewModel): string {
  return `
    <div class="repo-action-popover repo-ci-popover" role="menu">
      ${status.workflows.map(renderRepoCiStatusItem).join("")}
    </div>
  `;
}

function renderRepoCiStatusItem(workflow: RepoCiWorkflowStatusViewModel): string {
  return `
    <button
      class="repo-ci-item"
      type="button"
      role="menuitem"
      data-action="open-repo-ci-workflow"
      data-url="${escapeHtml(workflow.url)}"
      title="${escapeHtml(workflow.description)}"
    >
      <span class="repo-ci-item-icon repo-ci-status is-${workflow.tone}" aria-hidden="true">
        ${renderRepoCiStatusGlyph(workflow.tone)}
      </span>
      <span class="repo-ci-item-title">${escapeHtml(workflow.name)}</span>
    </button>
  `;
}

function renderRepoCiStatusGlyph(tone: RepoCiStatusViewModel["tone"]): string {
  if (tone === "success") {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="m3.25 8.25 3 3 6.5-6.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"/>
      </svg>
    `;
  }

  if (tone === "failure") {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.2"/>
      </svg>
    `;
  }

  return `<span class="repo-ci-dot" aria-hidden="true"></span>`;
}

function renderRepoGroupChevron(
  group: WatchGroupViewModel,
  isCollapsed: boolean,
): string {
  return `
    <button
      class="watch-group-toggle-chevron"
      type="button"
      data-action="toggle-group"
      data-repo="${escapeHtml(getWatchedRepoKey(group))}"
      title="${isCollapsed ? "Expand" : "Collapse"}"
      aria-label="${isCollapsed ? "Expand" : "Collapse"} ${escapeHtml(group.repoLabel)}"
      aria-expanded="${isCollapsed ? "false" : "true"}"
    >
      ${renderChevronIcon(isCollapsed)}
    </button>
  `;
}

function renderRepoGroupActions(group: WatchGroupViewModel, actions: RepoHeaderActions): string {
  const rowIds = group.rows.map((row) => row.id);
  const doneCandidate =
    actions.isCollapsed && group.rows.length > 0 && group.rows.every((row) => row.doneCandidate);

  return `
    <div class="watch-group-actions">
      ${actions.showOpenPullRequests ? renderPullRequestMenu(group) : ""}
      ${actions.showActiveWorkflowRuns ? renderActiveWorkflowRunMenu(group) : ""}
      ${rowIds.length > 0 ? renderTriageButtons(currentWatchView, rowIds, "watch-group-triage-button", group.repoLabel, doneCandidate) : ""}
    </div>
  `;
}

function renderActiveWorkflowRunMenu(group: WatchGroupViewModel): string {
  const repoKey = getWatchedRepoKey(group);
  const menuState = activeWorkflowRunMenu?.repoKey === repoKey ? activeWorkflowRunMenu : undefined;

  return `
    <div class="repo-action-menu repo-action-menu-container">
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
    return `<div class="repo-action-popover" role="menu"><div class="repo-action-status">Loading...</div></div>`;
  }

  if (menuState.status === "error") {
    return `
      <div class="repo-action-popover" role="menu">
        <div class="repo-action-status is-error">${escapeHtml(menuState.error)}</div>
      </div>
    `;
  }

  if (menuState.runs.length === 0) {
    return `<div class="repo-action-popover" role="menu"><div class="repo-action-status">No active workflow runs</div></div>`;
  }

  return `
    <div class="repo-action-popover" role="menu">
      ${menuState.runs.map((run) => renderActiveWorkflowRunItem(group, run)).join("")}
    </div>
  `;
}

function renderActiveWorkflowRunItem(group: WatchGroupViewModel, run: ActiveWorkflowRun): string {
  return `
    <button
      class="repo-action-item"
      type="button"
      role="menuitem"
      data-action="watch-active-workflow"
      data-owner="${escapeHtml(group.owner)}"
      data-repo="${escapeHtml(group.repo)}"
      data-run="${escapeHtml(run.runId)}"
      data-url="${escapeHtml(run.url)}"
      title="${escapeHtml(getActiveWorkflowRunTitle(run))}"
    >
      <span class="repo-action-number">${escapeHtml(formatWorkflowRunStatus(run.status))}</span>
      <span class="repo-action-title watch-title-cluster">
        <span class="watch-title-text">${escapeHtml(run.title)}</span>
        ${run.runNumber ? `<span class="repo-action-number">#${escapeHtml(run.runNumber)}</span>` : ""}
      </span>
      ${renderBranchBadge(run.branchName)}
    </button>
  `;
}

function getActiveWorkflowRunTitle(run: ActiveWorkflowRun): string {
  const title = `${run.title}${run.runNumber ? ` #${run.runNumber}` : ""}`;
  return run.branchName ? `${title} · ${run.branchName}` : title;
}

function formatWorkflowRunStatus(status: string): string {
  return status
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function renderPullRequestMenu(group: WatchGroupViewModel): string {
  const repoKey = getWatchedRepoKey(group);
  const menuState = pullRequestMenu?.repoKey === repoKey ? pullRequestMenu : undefined;

  return `
    <div class="repo-action-menu repo-action-menu-container">
      <button
        class="watch-group-pr-button"
        type="button"
        data-action="toggle-repo-prs"
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
      ${menuState ? renderPullRequestPopover(group, menuState) : ""}
    </div>
  `;
}

function renderPullRequestPopover(
  group: WatchGroupViewModel,
  menuState: PullRequestMenuState,
): string {
  if (menuState.status === "loading") {
    return `<div class="repo-action-popover" role="menu"><div class="repo-action-status">Loading...</div></div>`;
  }

  if (menuState.status === "error") {
    return `
      <div class="repo-action-popover" role="menu">
        <div class="repo-action-status is-error">${escapeHtml(menuState.error)}</div>
      </div>
    `;
  }

  if (menuState.pullRequests.length === 0) {
    return `<div class="repo-action-popover" role="menu"><div class="repo-action-status">No open pull requests</div></div>`;
  }

  return `
    <div class="repo-action-popover" role="menu">
      ${menuState.pullRequests.map((pullRequest) => renderPullRequestItem(group, pullRequest)).join("")}
    </div>
  `;
}

function renderPullRequestItem(group: WatchGroupViewModel, pullRequest: OpenPullRequest): string {
  return `
    <button
      class="repo-action-item"
      type="button"
      role="menuitem"
      data-action="watch-repo-pr"
      data-owner="${escapeHtml(group.owner)}"
      data-repo="${escapeHtml(group.repo)}"
      data-pr="${escapeHtml(pullRequest.number)}"
      title="#${escapeHtml(pullRequest.number)} ${escapeHtml(pullRequest.title)}"
    >
      <span class="repo-action-number">#${escapeHtml(pullRequest.number)}</span>
      <span class="repo-action-title">${renderTitleMarkup(pullRequest.title)}</span>
      ${pullRequest.isDraft ? `<span class="repo-action-badge">Draft</span>` : ""}
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

function bindEvents(): void {
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-add"]')) {
    button.addEventListener("click", () => {
      const wasAdding = isAdding && currentWatchView === "inbox";
      currentWatchView = "inbox";
      isAdding = !wasAdding;
      isClearMenuOpen = false;
      addError = undefined;
      render();

      if (isAdding) {
        void discoverAuthoredPullRequests();
      }
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="select-watch-view"]')) {
    button.addEventListener("click", () => {
      const view = parseWatchTriageState(button.dataset.watchView);

      if (!view || view === currentWatchView) {
        return;
      }

      currentWatchView = view;
      isAdding = false;
      isClearMenuOpen = false;
      pendingWatchAction = undefined;
      activeWorkflowRunMenu = undefined;
      pullRequestMenu = undefined;
      repositoryWatchMenu = undefined;
      repoCiStatusMenu = undefined;
      render();
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

  app.querySelector<HTMLButtonElement>('[data-action="retry-pr-discovery"]')?.addEventListener(
    "click",
    () => {
      void discoverAuthoredPullRequests(true);
    },
  );

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="add-discovered-pr"]')) {
    button.addEventListener("click", () => {
      const pullRequest = findDiscoveredPullRequest(button.dataset.prId);

      if (pullRequest) {
        void addDiscoveredPullRequest(pullRequest);
      }
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="dismiss-discovered-pr"]')) {
    button.addEventListener("click", () => {
      const pullRequest = findDiscoveredPullRequest(button.dataset.prId);

      if (pullRequest) {
        void dismissDiscoveredPullRequest(pullRequest);
      }
    });
  }

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

  app.querySelector<HTMLButtonElement>('[data-action="refresh"]')?.addEventListener(
    "click",
    () => {
      void refreshSettingsAndStatuses(currentWatchView);
    },
  );

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="open-github-url"]')) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const ids = getWatchReorderRowIds(button);

      for (const id of ids) {
        controller.markSeen(id);
      }

      queueSyncedStateUploadForWatchIds(ids);

      if (button.dataset.url) {
        void openExternalUrl(button.dataset.url);
      }
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-group"]')) {
    button.addEventListener("click", () => {
      const repoLabel = button.dataset.repo;

      if (repoLabel) {
        toggleRepoGroup(repoLabel);
      }
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-repo-ci-status"]')) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      toggleRepoCiStatusMenu(button.dataset.repo || "");
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="open-repo-ci-workflow"]')) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      repoCiStatusMenu = undefined;

      if (button.dataset.url) {
        void openExternalUrl(button.dataset.url);
      }
    });
  }

  app.querySelector<HTMLButtonElement>('[data-action="done-finished"]')?.addEventListener(
    "click",
    () => {
      isClearMenuOpen = false;
      controller.markFinishedDone(currentWatchView);
      queueSyncedStateUpload();
    },
  );

  app.querySelector<HTMLButtonElement>('[data-action="done-all"]')?.addEventListener(
    "click",
    () => {
      isClearMenuOpen = false;
      controller.markAllDone(currentWatchView);
      queueSyncedStateUpload();
    },
  );

  app.querySelector<HTMLButtonElement>('[data-action="clear-done"]')?.addEventListener(
    "click",
    () => {
      isClearMenuOpen = false;
      controller.clearDone(
        controller.getWatches()
          .filter((watch) => getWatchTriageState(watch) === "done")
          .map((watch) => watch.id),
      );
      queueSyncedStateUpload();
    },
  );

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-watched-pull-request-scope"]')) {
    button.addEventListener("click", () => {
      togglePullRequestWatches({
        owner: button.dataset.owner || "",
        repo: button.dataset.repo || "",
      }, getPullRequestWatchScope(button.dataset.scope));
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

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-repository-watches"]')) {
    button.addEventListener("click", () => {
      void toggleRepositoryWatchMenu({
        owner: button.dataset.owner || "",
        repo: button.dataset.repo || "",
      });
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-workflow-subscription"]')) {
    button.addEventListener("click", () => {
      toggleWorkflowSubscription({
        owner: button.dataset.owner || "",
        repo: button.dataset.repo || "",
        workflowName: button.dataset.workflow || "",
        targetKey: button.dataset.target || "",
      });
    });
  }

  app.querySelector<HTMLButtonElement>('[data-action="toggle-workflow-target-editor"]')?.addEventListener(
    "click",
    () => {
      if (repositoryWatchMenu?.status !== "loaded") {
        return;
      }

      repositoryWatchMenu = {
        ...repositoryWatchMenu,
        targetEditor: repositoryWatchMenu.targetEditor ? undefined : "menu",
      };
      render();
    },
  );

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="add-workflow-target"]')) {
    button.addEventListener("click", () => {
      const kind = getWorkflowTargetKind(button.dataset.kind);

      if (!kind || repositoryWatchMenu?.status !== "loaded") {
        return;
      }

      if (kind === "include" || kind === "exclude") {
        repositoryWatchMenu = { ...repositoryWatchMenu, targetEditor: kind };
        render();
        return;
      }

      addWorkflowTarget({
        owner: button.dataset.owner || "",
        repo: button.dataset.repo || "",
      }, kind);
    });
  }

  app.querySelector<HTMLFormElement>('[data-action="add-workflow-pattern"]')?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const kind = getWorkflowTargetKind(form.dataset.kind);
      const pattern = new FormData(form).get("pattern");
      const group = repositoryWatchMenu?.repoKey.split("/");

      if (
        (kind !== "include" && kind !== "exclude") ||
        typeof pattern !== "string" ||
        !pattern.trim() ||
        !group ||
        group.length !== 2
      ) {
        return;
      }

      addWorkflowTarget({ owner: group[0], repo: group[1] }, kind, pattern.trim());
    },
  );

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="select-workflow-target"]')) {
    button.addEventListener("click", () => {
      if (repositoryWatchMenu?.status !== "loaded") {
        return;
      }

      repositoryWatchMenu = {
        ...repositoryWatchMenu,
        selectedTargetKey: button.dataset.target,
        targetEditor: undefined,
      };
      render();
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="remove-workflow-target"]')) {
    button.addEventListener("click", () => {
      removeWorkflowTarget({
        owner: button.dataset.owner || "",
        repo: button.dataset.repo || "",
      }, button.dataset.target || "");
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="toggle-repo-prs"]')) {
    button.addEventListener("click", () => {
      void togglePullRequests({
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

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="watch-repo-pr"]')) {
    button.addEventListener("click", () => {
      void watchPullRequest({
        owner: button.dataset.owner || "",
        repo: button.dataset.repo || "",
        prNumber: button.dataset.pr || "",
      });
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="arm-rerun"]')) {
    button.addEventListener("click", () => {
      armWatchAction(button.dataset.id || "", "rerun");
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action^="rerun-"]')) {
    button.addEventListener("click", () => {
      const mode = getWatchRerunMode(button.dataset.action);

      if (mode) {
        void confirmRerun(button.dataset.id || "", mode);
      }
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="triage-watch"]')) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const triageState = parseWatchTriageState(button.dataset.triageState);

      if (triageState) {
        controller.setTriageState(getWatchReorderRowIds(button), triageState);
        queueSyncedStateUpload();
      }
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="clear-done-watch"]')) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      controller.clearDone(getWatchReorderRowIds(button));
      queueSyncedStateUpload();
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="mark-seen"]')) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const ids = getClickedUnseenWatchIds(controller.getWatches(), button.dataset.id, getWatchReorderRowIds(button));

      for (const id of ids) {
        controller.markSeen(id);
      }

      queueSyncedStateUploadForWatchIds(ids);
    });
  }

  for (const row of app.querySelectorAll<HTMLElement>(".watch")) {
    row.addEventListener("mouseleave", () => {
      dismissWatchActionOnRowLeave(row.dataset.id);
    });
  }

  bindRepoReorderEvents();
  bindWatchReorderEvents();
}

function renderClearMenu(hasWatches: boolean, hasFinishedWatches: boolean): string {
  return `
    <div class="clear-menu-popover" role="menu">
      ${getOverflowMenuItems({
        autoStartEnabled,
        autoStartBusy,
        hasWatches,
        hasFinishedWatches,
        isDoneView: currentWatchView === "done",
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


}

function getRepoHeaderPressKey(header: HTMLElement, event: Event): string | undefined {
  if (!(event.target instanceof Element)) {
    return undefined;
  }

  if (event.target.closest('.watch-group-watch, .watch-group-actions, .repo-action-menu, .watch-group-toggle-chevron, .repo-ci-status, [data-action="open-github-url"]')) {
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

  if (event.target.closest('.watch-actions, [data-action="mark-seen"], [data-action="open-github-url"]')) {
    return undefined;
  }

  const key = row.dataset.reorderKey;
  const rowIds = getWatchReorderRowIds(row);
  const repoKey = row.closest<HTMLElement>(".watch-group[data-repo]")?.dataset.repo;

  return key && repoKey && rowIds.length > 0 ? { repoKey, key, rowIds } : undefined;
}

function getWatchReorderRowIds(element: HTMLElement): string[] {
  return (element.dataset.rowIds || "")
    .split("\n")
    .map((rowId) => rowId.trim())
    .filter((rowId) => rowId.length > 0);
}

function toggleRepoGroup(repoLabel: string): void {
  collapsedGroups.toggle(repoLabel);
  isClearMenuOpen = false;
  repoCiStatusMenu = undefined;
  render();
}

function parseWatchTriageState(value: string | undefined): WatchTriageState | undefined {
  return value === "inbox" || value === "saved" || value === "done" ? value : undefined;
}

function startWatchPointerDrag(repoKey: string, sourceKey: string, sourceIds: string[]): void {
  if (!watchPressState || watchPressState.repoKey !== repoKey || watchPressState.sourceKey !== sourceKey) {
    return;
  }

  watchPressState = undefined;
  watchDragState = { repoKey, sourceKey, sourceIds };
  isClearMenuOpen = false;
  activeWorkflowRunMenu = undefined;
  pullRequestMenu = undefined;
  repositoryWatchMenu = undefined;
  repoCiStatusMenu = undefined;

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
  pullRequestMenu = undefined;
  repositoryWatchMenu = undefined;
  repoCiStatusMenu = undefined;

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
  const sourceIds = watchDragState.sourceIds;
  const target = getPointerWatchDropTarget(event.clientY);
  const targetIds = target ? getWatchReorderTargetIds(target.targetKey) : [];

  watchDragState = undefined;
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
  document.removeEventListener("pointermove", updateWatchPointerDrag);
  document.removeEventListener("pointerup", finishWatchPointerDrag);
  document.removeEventListener("pointercancel", cancelWatchPointerDrag);
  clearWatchDragStateClasses();
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

}

function clearRepoDragStateClasses(): void {
  app.querySelector(".watch-list")?.classList.remove("is-reordering");

  for (const groupElement of app.querySelectorAll(".watch-group")) {
    groupElement.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
  }
}

function clearWatchDragStateClasses(): void {
  app.querySelector(".watch-list")?.classList.remove("is-reordering-runs");

  for (const groupList of app.querySelectorAll(".watch-group-list")) {
    groupList.classList.remove("is-reordering-runs");
  }

  for (const rowElement of app.querySelectorAll(".watch")) {
    rowElement.classList.remove("is-row-dragging", "is-row-drop-before", "is-row-drop-after");
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

  void updateAppSettings({ ...settings, repoOrder }, true);
  render();
}

function reorderWatchesWithinRepo(sourceIds: string[], targetIds: string[], position: RepoDropPosition): void {
  controller.reorderGroupWithinRepo(sourceIds, targetIds, position);
  queueSyncedStateUploadForWatchIds([...sourceIds, ...targetIds]);
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

function toggleRepoCiStatusMenu(repoKey: string): void {
  if (!repoKey) {
    return;
  }

  repoCiStatusMenu = repoCiStatusMenu?.repoKey === repoKey ? undefined : { repoKey };
  activeWorkflowRunMenu = undefined;
  pullRequestMenu = undefined;
  repositoryWatchMenu = undefined;
  isClearMenuOpen = false;
  render();
}

function togglePullRequestWatches(
  repo: Pick<WatchedRepo, "owner" | "repo">,
  scope: WatchedPullRequestScope | undefined,
): void {
  if (!repo.owner || !repo.repo || !scope) {
    return;
  }

  const wasWatched = isWatchedRepo(settings.watchedRepos, repo);
  let watchedRepos = toggleWatchedPullRequestScope(settings.watchedRepos, repo, scope);

  if (!wasWatched) {
    watchedRepos = updateWatchedRepoIcon(watchedRepos, repo, findRepoIconUrl(repo));
  }

  void updateAppSettings({ ...settings, watchedRepos }, true);
  render();
  void refreshListedRepositoryCiStatuses();

  if (!wasWatched) {
    void refreshWatchedRepoIcon(repo);
  }
}

function getPullRequestWatchScope(value: string | undefined): WatchedPullRequestScope | undefined {
  return value === "all" || value === "user" ? value : undefined;
}

async function addWatchedRepository(repo: Pick<WatchedRepo, "owner" | "repo">): Promise<void> {
  let watchedRepos = addWatchedRepo(settings.watchedRepos, repo);
  watchedRepos = updateWatchedRepoIcon(watchedRepos, repo, findRepoIconUrl(repo));

  if (watchedRepos !== settings.watchedRepos) {
    await updateAppSettings({ ...settings, watchedRepos }, true);
  }

  void refreshWatchedRepoIcon(repo);
}

async function addDiscoveredPullRequest(pullRequest: AuthoredOpenPullRequest): Promise<void> {
  try {
    await controller.add({
      kind: "pr",
      owner: pullRequest.owner,
      repo: pullRequest.repo,
      prNumber: pullRequest.number,
      url: pullRequest.url,
    });
    queueSyncedStateUpload();
    addError = undefined;
    render();
  } catch (error) {
    addError = error instanceof Error ? error.message : String(error);
    render();
  }
}

async function dismissDiscoveredPullRequest(pullRequest: AuthoredOpenPullRequest): Promise<void> {
  const id = getPullRequestDiscoveryId(pullRequest);

  if (settings.dismissedPullRequests.includes(id)) {
    return;
  }

  try {
    await updateAppSettings({
      ...settings,
      dismissedPullRequests: [...settings.dismissedPullRequests, id],
    }, true);
    addError = undefined;
  } catch (error) {
    addError = error instanceof Error ? error.message : String(error);
  }

  render();
}

function findDiscoveredPullRequest(id: string | undefined): AuthoredOpenPullRequest | undefined {
  return id
    ? getDiscoveredUnwatchedPullRequests().find(
      (pullRequest) => getPullRequestDiscoveryId(pullRequest) === id,
    )
    : undefined;
}

function getDiscoveredUnwatchedPullRequests(): AuthoredOpenPullRequest[] {
  if (pullRequestDiscovery.status !== "loaded") {
    return [];
  }

  const watchedPullRequestIds = controller.getWatches().flatMap((watch) =>
    watch.target.kind === "pr"
      ? [getPullRequestDiscoveryId({
        owner: watch.target.owner,
        repo: watch.target.repo,
        number: watch.target.prNumber,
      })]
      : [],
  );

  return getUnwatchedPullRequests(
    pullRequestDiscovery.pullRequests,
    settings.watchedRepos,
    watchedPullRequestIds,
    settings.dismissedPullRequests,
  );
}

async function discoverAuthoredPullRequests(force = false): Promise<void> {
  if (pullRequestDiscovery.status === "loading") {
    return;
  }

  if (
    !force &&
    pullRequestDiscovery.status === "loaded" &&
    Date.now() - pullRequestDiscovery.loadedAt < 60_000
  ) {
    return;
  }

  pullRequestDiscovery = { status: "loading" };
  render();

  try {
    const pullRequests = isDemoMode
      ? await fetchDemoAuthoredOpenPullRequests()
      : await fetchAuthoredOpenPullRequests();
    pullRequestDiscovery = { status: "loaded", pullRequests, loadedAt: Date.now() };
  } catch (error) {
    console.warn("Could not discover open pull requests.", error);
    pullRequestDiscovery = {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  render();
}

async function refreshWatchedRepoIcon(repo: Pick<WatchedRepo, "owner" | "repo">): Promise<void> {
  const repoKey = getWatchedRepoKey(repo);
  const current = settings.watchedRepos.find((watchedRepo) => getWatchedRepoKey(watchedRepo) === repoKey);

  if (!current || current.repoIconUrl || isDemoMode) {
    return;
  }

  try {
    const repoIconUrl = await getRepositoryIconUrl(repo);
    const watchedRepos = updateWatchedRepoIcon(settings.watchedRepos, repo, repoIconUrl);

    if (watchedRepos !== settings.watchedRepos) {
      await updateAppSettings({ ...settings, watchedRepos }, false);
      render();
    }
  } catch {
    // Missing avatars should not interfere with watched repositories.
  }
}

function findRepoIconUrl(repo: Pick<WatchedRepo, "owner" | "repo">): string | undefined {
  return controller
    .getWatches()
    .find((watch) => watch.target.owner === repo.owner && watch.target.repo === repo.repo)?.repoIconUrl;
}

async function togglePullRequests(repo: Pick<WatchedRepo, "owner" | "repo">): Promise<void> {
  if (!repo.owner || !repo.repo) {
    return;
  }

  const repoKey = getWatchedRepoKey(repo);

  if (pullRequestMenu?.repoKey === repoKey) {
    pullRequestMenu = undefined;
    render();
    return;
  }

  pullRequestMenu = { repoKey, status: "loading" };
  activeWorkflowRunMenu = undefined;
  repositoryWatchMenu = undefined;
  repoCiStatusMenu = undefined;
  isClearMenuOpen = false;
  render();

  try {
    const pullRequests = await controller.listOpenPullRequests(repo);

    if (pullRequestMenu?.repoKey === repoKey) {
      pullRequestMenu = { repoKey, status: "loaded", pullRequests };
      render();
    }
  } catch (error) {
    if (pullRequestMenu?.repoKey === repoKey) {
      pullRequestMenu = {
        repoKey,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      render();
    }
  }
}

async function toggleActiveWorkflowRuns(repo: Pick<WatchedRepo, "owner" | "repo">): Promise<void> {
  if (!repo.owner || !repo.repo) {
    return;
  }

  const repoKey = getWatchedRepoKey(repo);

  if (activeWorkflowRunMenu?.repoKey === repoKey) {
    activeWorkflowRunMenu = undefined;
    render();
    return;
  }

  activeWorkflowRunMenu = { repoKey, status: "loading" };
  pullRequestMenu = undefined;
  repositoryWatchMenu = undefined;
  repoCiStatusMenu = undefined;
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

async function toggleRepositoryWatchMenu(repo: Pick<WatchedRepo, "owner" | "repo">): Promise<void> {
  if (!repo.owner || !repo.repo) {
    return;
  }

  const repoKey = getWatchedRepoKey(repo);

  if (repositoryWatchMenu?.repoKey === repoKey) {
    repositoryWatchMenu = undefined;
    render();
    return;
  }

  repositoryWatchMenu = { repoKey, status: "loading" };
  activeWorkflowRunMenu = undefined;
  pullRequestMenu = undefined;
  repoCiStatusMenu = undefined;
  isClearMenuOpen = false;
  render();

  try {
    const userLoginPromise = getAuthenticatedUserLogin();
    void userLoginPromise.then(
      (userLogin) => {
        const currentMenu = repositoryWatchMenu;

        if (currentMenu?.repoKey === repoKey && currentMenu.status === "loading") {
          repositoryWatchMenu = { ...currentMenu, userLogin };
          render();
        }
      },
      () => undefined,
    );
    const [workflows, defaultBranch, userLogin] = await Promise.all([
      controller.listWorkflowDefinitions(repo),
      getCachedRepositoryDefaultBranch(repo),
      userLoginPromise,
    ]);

    if (repositoryWatchMenu?.repoKey === repoKey) {
      repositoryWatchMenu = { repoKey, status: "loaded", workflows, defaultBranch, userLogin };
      render();
    }
  } catch (error) {
    if (repositoryWatchMenu?.repoKey === repoKey) {
      const userLogin = repositoryWatchMenu.userLogin;
      repositoryWatchMenu = {
        repoKey,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        ...(userLogin ? { userLogin } : {}),
      };
      render();
    }
  }
}

function toggleWorkflowSubscription(
  target: Pick<WatchedRepo, "owner" | "repo"> & {
    targetKey: string;
    workflowName: string;
  },
): void {
  if (!target.owner || !target.repo || !target.workflowName || !target.targetKey) {
    return;
  }

  const wasWatched = isWatchedRepo(settings.watchedRepos, target);
  let watchedRepos = toggleWatchedWorkflowSubscription(
    settings.watchedRepos,
    target,
    target.targetKey,
    target.workflowName,
  );

  if (!wasWatched) {
    watchedRepos = updateWatchedRepoIcon(watchedRepos, target, findRepoIconUrl(target));
  }

  void updateAppSettings({ ...settings, watchedRepos }, true);
  render();

  if (!wasWatched) {
    void refreshWatchedRepoIcon(target);
  }

  void refreshSettingsAndStatuses();
}

function addWorkflowTarget(
  repo: Pick<WatchedRepo, "owner" | "repo">,
  kind: WatchedWorkflowTargetKind,
  pattern?: string,
): void {
  const wasWatched = isWatchedRepo(settings.watchedRepos, repo);
  let watchedRepos = addWatchedWorkflowTarget(settings.watchedRepos, repo, { kind, pattern });
  const targetKey = getWatchedWorkflowTargetKey({ kind, pattern });

  if (!wasWatched) {
    watchedRepos = updateWatchedRepoIcon(watchedRepos, repo, findRepoIconUrl(repo));
  }

  if (repositoryWatchMenu?.repoKey === getWatchedRepoKey(repo) && repositoryWatchMenu.status === "loaded") {
    repositoryWatchMenu = { ...repositoryWatchMenu, selectedTargetKey: targetKey, targetEditor: undefined };
  }

  void updateAppSettings({ ...settings, watchedRepos }, true);
  render();

  if (!wasWatched) {
    void refreshWatchedRepoIcon(repo);
  }
}

function removeWorkflowTarget(repo: Pick<WatchedRepo, "owner" | "repo">, targetKey: string): void {
  const watchedRepos = removeWatchedWorkflowTarget(settings.watchedRepos, repo, targetKey);

  if (repositoryWatchMenu?.repoKey === getWatchedRepoKey(repo) && repositoryWatchMenu.status === "loaded") {
    repositoryWatchMenu = { ...repositoryWatchMenu, selectedTargetKey: undefined };
  }

  void updateAppSettings({ ...settings, watchedRepos }, true);
  render();
  void refreshSettingsAndStatuses();
}

function getWorkflowTargetKind(value: string | undefined): WatchedWorkflowTargetKind | undefined {
  return value === "default" || value === "own" || value === "all" || value === "include" || value === "exclude"
    ? value
    : undefined;
}

async function watchActiveWorkflowRun(
  target: Pick<WatchedRepo, "owner" | "repo"> & { runId: string; url: string },
): Promise<void> {
  if (!target.owner || !target.repo || !target.runId || !target.url) {
    return;
  }

  const repoKey = getWatchedRepoKey(target);

  try {
    await controller.add({
      kind: "run",
      owner: target.owner,
      repo: target.repo,
      runId: target.runId,
      url: target.url,
    });
    queueSyncedStateUpload();
    currentWatchView = "inbox";
    activeWorkflowRunMenu = undefined;
    repositoryWatchMenu = undefined;
    repoCiStatusMenu = undefined;
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

async function watchPullRequest(
  target: Pick<WatchedRepo, "owner" | "repo"> & { prNumber: string },
): Promise<void> {
  if (!target.owner || !target.repo || !target.prNumber) {
    return;
  }

  const repoKey = getWatchedRepoKey(target);

  try {
    await controller.add({
      kind: "pr",
      owner: target.owner,
      repo: target.repo,
      prNumber: target.prNumber,
      url: `https://github.com/${target.owner}/${target.repo}/pull/${target.prNumber}`,
    });
    queueSyncedStateUpload();
    currentWatchView = "inbox";
    pullRequestMenu = undefined;
    repositoryWatchMenu = undefined;
    repoCiStatusMenu = undefined;
  } catch (error) {
    pullRequestMenu = {
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

  pendingWatchAction = pendingWatchAction?.id === id && pendingWatchAction.kind === kind
    ? undefined
    : { id, kind };
  isClearMenuOpen = false;
  repoCiStatusMenu = undefined;
  render();

  if (pendingWatchAction) {
    window.requestAnimationFrame(() => {
      app.querySelector<HTMLButtonElement>(".watch-rerun-popover .repo-action-item")?.focus();
    });
  }
}

function dismissWatchActionOnRowLeave(rowId: string | undefined): void {
  if (!shouldDismissPendingWatchActionOnRowLeave(pendingWatchAction, rowId)) {
    return;
  }

  pendingWatchAction = undefined;
  render();
}

function handleTargetedPollResult(result: WatchPollResult): void {
  if (result.status === "successful") {
    return;
  }

  if (result.status === "degraded") {
    lastSuccessfulRefreshAt = new Date();
  }

  lastRefreshFailed = result.status === "failed";
  lastRefreshDegraded = result.status === "degraded";

  for (const failure of result.watchFailures) {
    console.warn(`Could not refresh ${failure.watchId}: ${failure.message}`);
  }

  for (const failure of result.metadataFailures) {
    console.warn(`Could not refresh ${failure.scope}: ${failure.message}`);
  }

  for (const failure of result.notificationFailures) {
    console.warn(`Could not notify for ${failure.watchId}: ${failure.message}`);
  }

  render();
  void updateTrayIndicator();
}

async function confirmRerun(id: string, mode: RerunMode): Promise<void> {
  if (!id) {
    return;
  }

  pendingWatchAction = undefined;
  const removesSyncedWatch = controller.getWatches().some(
    (watch) => watch.id === id && getWatchTriageState(watch) !== "inbox",
  );

  try {
    await controller.rerun(id, mode);

    if (removesSyncedWatch) {
      queueSyncedStateUpload();
    }

    queueRerunRefresh(id);
  } catch (error) {
    console.error(`Could not re-run ${mode === "all" ? "all" : "failed"} GitHub Actions jobs.`, error);
  }

  render();
  void updateTrayIndicator();
}

function queueRerunRefresh(id: string): void {
  if (isDemoMode) {
    return;
  }

  window.setTimeout(() => {
    void controller.pollNow({ watchIds: [id] })
      .then(handleTargetedPollResult)
      .catch((error) => {
        console.warn("Could not refresh the re-run GitHub Actions state.", error);
      });
  }, rerunRefreshDelayMs);
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

async function openExternalUrl(url: string): Promise<void> {
  await hideMainWindow();
  await invokeDesktop("open_github_url", { url });
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
      await addWatchedRepository(target);
    } else {
      await controller.add(target);
      queueSyncedStateUpload();
    }

    currentWatchView = "inbox";
    isAdding = false;
    isClearMenuOpen = false;
    repoCiStatusMenu = undefined;
    addError = undefined;
  } catch (error) {
    addError = error instanceof Error ? error.message : String(error);
  }

  render();
  void refreshListedRepositoryCiStatuses();
  void updateTrayIndicator();
}

async function parseWatchInput(input: string): Promise<ParsedGitHubTarget> {
  if (!isOwnerlessPullRequestSlug(input) && !isOwnerlessRepositorySlug(input)) {
    return parseGitHubActionsUrl(input);
  }

  return parseGitHubActionsUrl(input, { defaultOwner: await getAuthenticatedUserLogin() });
}

async function updateRateLimit(): Promise<boolean> {
  try {
    rateLimit = await fetchRateLimit();
    render();
    return true;
  } catch (error) {
    console.warn("Could not fetch GitHub rate limit.", error);
    return false;
  }
}

async function updateAppSettings(nextSettings: typeof settings, syncRemote: boolean): Promise<void> {
  await session.updateSettings(nextSettings, syncRemote);
}

function getLocalSyncedState() {
  return {
    settings,
    watches: controller.getWatches(),
    watchSuppressions: controller.getWatchSuppressions(),
  };
}

function queueSyncedStateUpload(): void {
  session.changed();
}

function queueSyncedStateUploadForWatchIds(ids: string[]): void {
  const idSet = new Set(ids);
  const includesSyncedWatch = controller.getWatches().some(
    (watch) => idSet.has(watch.id) && getWatchTriageState(watch) !== "inbox",
  );

  if (includesSyncedWatch) {
    queueSyncedStateUpload();
  }
}

async function refreshSettingsAndStatuses(manualRefreshView?: WatchTriageState): Promise<void> {
  await session.refresh(manualRefreshView);
}

async function poll(manualRefreshView?: WatchTriageState): Promise<void> {
  const forceVisibleData = manualRefreshView !== undefined;

  try {
    let successfulItems = 0;
    let failedItems = 0;
    let rateLimitSucceeded: boolean | undefined;

    if (isDemoMode) {
      await refreshListedRepositoryCiStatuses(forceVisibleData);
      successfulItems += 1;
    } else {
      const subscriptionResult = await controller.syncWorkflowSubscriptions(settings.watchedRepos);
      successfulItems +=
        subscriptionResult.status !== "failed" &&
          subscriptionResult.anyGithubRequestSucceeded
          ? 1
          : 0;
      failedItems += subscriptionResult.failures.length;
      failedItems += subscriptionResult.notificationFailures.length;

      for (const failure of subscriptionResult.failures) {
        console.warn(`Could not sync workflow subscriptions for ${failure.repository}: ${failure.message}`);
      }

      for (const failure of subscriptionResult.notificationFailures) {
        console.warn(`Could not notify for ${failure.watchId}: ${failure.message}`);
      }

      const watchView = manualRefreshView ?? "inbox";

      if (watchView !== "done") {
        const pollResult = await controller.pollNow({
          triageState: watchView,
          includeInactive: forceVisibleData,
          prefetchedPullRequestDetails: subscriptionResult.prefetchedPullRequestDetails,
          prefetchedWatchSnapshots: subscriptionResult.prefetchedWatchSnapshots,
        });
        successfulItems += pollResult.successfulWatchIds.length;
        failedItems +=
          pollResult.watchFailures.length +
          pollResult.metadataFailures.length +
          pollResult.notificationFailures.length;

        for (const failure of pollResult.watchFailures) {
          console.warn(`Could not refresh ${failure.watchId}: ${failure.message}`);
        }

        for (const failure of pollResult.metadataFailures) {
          console.warn(`Could not refresh ${failure.scope}: ${failure.message}`);
        }

        for (const failure of pollResult.notificationFailures) {
          console.warn(`Could not notify for ${failure.watchId}: ${failure.message}`);
        }
      }
      await refreshListedRepositoryCiStatuses(forceVisibleData);
      rateLimitSucceeded = await updateRateLimit();
    }

    const refreshHealth = getRefreshHealth({
      successfulItems,
      failedItems,
      rateLimitSucceeded,
    });

    if (refreshHealth.hasSuccessfulRequest) {
      lastSuccessfulRefreshAt = new Date();
    }

    lastRefreshFailed = refreshHealth.status === "failed";
    lastRefreshDegraded = refreshHealth.status === "degraded";
  } catch (error) {
    lastRefreshFailed = true;
    lastRefreshDegraded = false;
    console.warn("Could not refresh GitHub status.", error);
  }
}

async function refreshListedRepositoryCiStatuses(force = false): Promise<void> {
  const repos = getListedRepositories();
  const listedKeys = new Set(repos.map(getWatchedRepoKey));
  const nextRepoCiStatuses = Object.fromEntries(
    Object.entries(repoCiStatuses).filter(([repoKey]) => listedKeys.has(repoKey)),
  );

  if (Object.keys(nextRepoCiStatuses).length !== Object.keys(repoCiStatuses).length) {
    repoCiStatuses = nextRepoCiStatuses;
    render();
  }

  for (const repoKey of repoCiStatusUpdatedAt.keys()) {
    if (!listedKeys.has(repoKey)) {
      repoCiStatusUpdatedAt.delete(repoKey);
    }
  }

  for (const repoKey of repoDefaultBranches.keys()) {
    if (!listedKeys.has(repoKey)) {
      repoDefaultBranches.delete(repoKey);
    }
  }

  for (const repoKey of repoCiWorkflowsUpdatedAt.keys()) {
    if (!listedKeys.has(repoKey)) {
      repoCiWorkflowsUpdatedAt.delete(repoKey);
    }
  }

  await Promise.all(repos.map((repo) => refreshRepositoryCiStatus(repo, force)));
}

async function refreshRepositoryCiStatus(repo: Pick<WatchedRepo, "owner" | "repo">, force: boolean): Promise<void> {
  const repoKey = getWatchedRepoKey(repo);
  const previousStatus = repoCiStatuses[repoKey];

  if (
    repoCiStatusRefreshes.has(repoKey) ||
    !shouldRefreshRepoCiStatus({
      force,
      lastUpdatedAt: repoCiStatusUpdatedAt.get(repoKey),
      now: Date.now(),
      popupOpen: isPopupOpen,
    })
  ) {
    return;
  }

  repoCiStatusRefreshes.add(repoKey);

  try {
    const defaultBranch = await getCachedRepositoryDefaultBranch(repo, force);
    const commitSha = isDemoMode
      ? "demo-default-branch-commit"
      : await fetchRepositoryCommitSha(repo, defaultBranch);

    if (!shouldRefreshRepoCiWorkflows({
      commitSha,
      force,
      lastUpdatedAt: repoCiWorkflowsUpdatedAt.get(repoKey),
      now: Date.now(),
      previousStatus,
    })) {
      return;
    }

    const status = isDemoMode
      ? await fetchDemoRepositoryDefaultBranchCiStatus(repo)
      : await fetchRepositoryDefaultBranchCiStatus(repo, { commitSha, defaultBranch });

    repoCiStatuses = {
      ...repoCiStatuses,
      [repoKey]: toRepoCiStatusViewModel(status),
    };
    repoCiWorkflowsUpdatedAt.set(repoKey, Date.now());
  } catch (error) {
    console.warn(`Could not refresh default branch CI status for ${repoKey}.`, error);
    const status = getRepoCiStatusAfterRefreshError(previousStatus);

    if (status) {
      repoCiStatuses = {
        ...repoCiStatuses,
        [repoKey]: status,
      };
    }
  } finally {
    repoCiStatusUpdatedAt.set(repoKey, Date.now());
    repoCiStatusRefreshes.delete(repoKey);
    render();
  }
}

async function getCachedRepositoryDefaultBranch(
  repo: Pick<WatchedRepo, "owner" | "repo">,
  force = false,
): Promise<string> {
  const repoKey = getWatchedRepoKey(repo);
  const cached = repoDefaultBranches.get(repoKey);

  if (cached && !force) {
    return cached;
  }

  const pending = repoDefaultBranchRefreshes.get(repoKey);

  if (pending) {
    return pending;
  }

  const refresh = (isDemoMode ? Promise.resolve("main") : fetchRepositoryDefaultBranch(repo)).then(
    (defaultBranch) => {
      repoDefaultBranches.set(repoKey, defaultBranch);
      return defaultBranch;
    },
  );
  repoDefaultBranchRefreshes.set(repoKey, refresh);

  try {
    return await refresh;
  } finally {
    repoDefaultBranchRefreshes.delete(repoKey);
  }
}

function getListedRepositories(): Array<Pick<WatchedRepo, "owner" | "repo">> {
  const repos = new Map<string, Pick<WatchedRepo, "owner" | "repo">>();

  for (const watchedRepo of settings.watchedRepos) {
    repos.set(getWatchedRepoKey(watchedRepo), { owner: watchedRepo.owner, repo: watchedRepo.repo });
  }

  for (const watch of controller.getWatches()) {
    if (getWatchTriageState(watch) === "done") {
      continue;
    }

    repos.set(getWatchedRepoKey(watch.target), { owner: watch.target.owner, repo: watch.target.repo });
  }

  return [...repos.values()];
}

function toRepoCiStatusViewModel(status: RepositoryCiStatus): RepoCiStatusViewModel {
  return {
    tone: status.tone,
    label: status.label,
    description: status.description,
    defaultBranch: status.defaultBranch,
    ...(status.commitSha ? { commitSha: status.commitSha } : {}),
    workflows: status.workflows.map((workflow) => ({
      tone: workflow.tone,
      label: workflow.label,
      description: workflow.description,
      name: workflow.name,
      url: workflow.url,
    })),
    ...(status.url ? { url: status.url } : {}),
  };
}

async function updateTrayIndicator(): Promise<void> {
  const summary = createTrayState(controller.getWatches());
  const tooltip = updateAvailable ? `${summary.tooltip} · Update available` : summary.tooltip;

  await setTrayIndicator(
    summary.status,
    tooltip,
    summary.hasUnseenChanges || updateAvailable,
  );
}

async function resizePopupToContent(): Promise<void> {
  if (document.documentElement.dataset.platform === "linux") {
    return;
  }

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

async function fetchDemoOpenPullRequests(): Promise<OpenPullRequest[]> {
  return [
    {
      number: "12",
      title: "Add watched repository quick watches",
      isDraft: false,
      authorLogin: "jpnurmi",
      headBranch: "feat/tray-badges",
      updatedAt: "2026-05-17T12:45:00Z",
      url: "https://github.com/getsentry/sentry/pull/12",
    },
    {
      number: "13",
      title: "Refine tray popup spacing",
      isDraft: true,
      authorLogin: "jpnurmi",
      headBranch: "feat/popup-spacing",
      updatedAt: "2026-05-17T11:30:00Z",
      url: "https://github.com/getsentry/sentry/pull/13",
    },
  ];
}

async function fetchDemoAuthoredOpenPullRequests(): Promise<AuthoredOpenPullRequest[]> {
  return [
    {
      owner: "getsentry",
      repo: "relay",
      number: "812",
      title: "Keep discovery results compact",
      isDraft: false,
      updatedAt: "2026-08-18T12:45:00Z",
      url: "https://github.com/getsentry/relay/pull/812",
    },
    {
      owner: "getsentry",
      repo: "seer",
      number: "94",
      title: "Improve workflow status handling",
      isDraft: true,
      updatedAt: "2026-08-18T11:30:00Z",
      url: "https://github.com/getsentry/seer/pull/94",
    },
  ];
}

async function fetchDemoActiveWorkflowRuns(): Promise<ActiveWorkflowRun[]> {
  return [
    {
      runId: "21",
      title: "CI: Build and test",
      event: "pull_request",
      workflowName: "CI",
      status: "in_progress",
      branchName: "feat/tray-badges",
      updatedAt: "2026-05-17T12:50:00Z",
      url: "https://github.com/getsentry/sentry/actions/runs/21",
    },
    {
      runId: "22",
      title: "Release: Package app",
      workflowName: "Release",
      status: "queued",
      branchName: "release/0.2",
      updatedAt: "2026-05-17T12:45:00Z",
      url: "https://github.com/getsentry/sentry/actions/runs/22",
    },
  ];
}

async function fetchDemoUserActiveWorkflowRuns(): Promise<ActiveWorkflowRun[]> {
  return [
    {
      runId: "21",
      title: "CI: Build and test",
      event: "workflow_dispatch",
      workflowName: "CI",
      status: "in_progress",
      branchName: "feat/tray-badges",
      updatedAt: "2026-05-17T12:50:00Z",
      url: "https://github.com/getsentry/sentry/actions/runs/21",
    },
  ];
}

async function fetchDemoWorkflowDefinitions(): Promise<WorkflowDefinition[]> {
  return [
    {
      name: "CI",
      path: ".github/workflows/ci.yml",
      state: "active",
    },
    {
      name: "CodeQL",
      path: ".github/workflows/codeql.yml",
      state: "active",
    },
    {
      name: "Release",
      path: ".github/workflows/release.yml",
      state: "active",
    },
  ];
}

async function fetchDemoRepositoryDefaultBranchCiStatus(
  repo: Pick<WatchedRepo, "owner" | "repo">,
): Promise<RepositoryCiStatus> {
  const pending = repo.repo === "sentry";
  const workflowUrl = `https://github.com/${repo.owner}/${repo.repo}/actions/runs/${pending ? "21" : "22"}`;

  return {
    tone: pending ? "pending" : "success",
    label: pending ? "Pending" : "Passing",
    description: pending ? "main: 1 workflow pending" : "main: 1 workflow passed",
    defaultBranch: "main",
    commitSha: "demo-default-branch-commit",
    updatedAt: "2026-05-17T12:50:00Z",
    url: workflowUrl,
    workflows: [
      {
        tone: pending ? "pending" : "success",
        label: pending ? "Pending" : "Passing",
        description: pending ? "CI is in progress" : "CI passed",
        name: "CI",
        url: workflowUrl,
        updatedAt: "2026-05-17T12:50:00Z",
      },
    ],
  };
}

function loadInitialWatches(): WatchRecord[] {
  if (isDemoMode) {
    return [
      createDemoWatch("8", "CI: feat: auto-start", "completed", "success", false, {
        runTitle: "feat: auto-start",
        workflowName: "CI",
        branchName: "feat/auto-start",
        prNumber: "8",
        sourceState: "merged",
        triageState: "done",
      }),
      createDemoWatch("9", "CI: feat: slug", "completed", "success", false, {
        runTitle: "feat: slug",
        workflowName: "CI",
        branchName: "feat/slug",
        prNumber: "9",
        sourceState: "merged",
        triageState: "saved",
      }),
      createDemoWatch("10", "CI: ci: add Rust cache", "completed", "success", false, {
        runTitle: "ci: add Rust cache",
        workflowName: "CI",
        branchName: "ci/rust-cache",
        timing: {
          startedAt: "2026-05-17T09:28:00Z",
          completedAt: "2026-05-17T09:31:00Z",
        },
      }),
      createDemoWatch("11", "Build / package app (macOS)", "in_progress", null, true, {
        jobId: "42",
        jobName: "package app (macOS)",
        workflowName: "Build",
        branchName: "main",
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
    branchName?: string;
    jobId?: string;
    jobName?: string;
    prNumber?: string;
    runTitle?: string;
    sourceState?: WatchRecord["sourceState"];
    timing?: WatchRecord["timing"];
    triageState?: WatchTriageState;
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
    ...(options.triageState ? { triageState: options.triageState } : {}),
    label,
    metadata: {
      ...(options.workflowName ? { workflowName: options.workflowName } : {}),
      ...(options.runTitle ? { runTitle: options.runTitle } : {}),
      ...(options.jobName ? { jobName: options.jobName } : {}),
      ...(options.branchName ? { branchName: options.branchName } : {}),
    },
    status: conclusion ? `${status}:${conclusion}` : status,
    lastState: { status, conclusion },
    ...(options.timing ? { timing: options.timing } : {}),
    active,
    error: undefined,
  };
}
