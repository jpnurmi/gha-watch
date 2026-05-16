import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { getRerunActionIconSvg } from "./app/actionIcon";
import { createCollapsedGroups } from "./app/collapsedGroups";
import { getPopupBodySections, type PopupBodySection } from "./app/popupLayout";
import { calculatePopupHeight, popupMinHeight, popupWidth } from "./app/popupSize";
import { getStatusIconSvg } from "./app/statusIcon";
import { createWatchController } from "./app/watchController";
import { isWatchActionConfirmation } from "./app/watchActionConfirmation";
import { createTrayState } from "./app/trayState";
import { createPopupViewModel, type WatchGroupViewModel, type WatchRowViewModel } from "./app/viewModel";
import type { WatchNotification } from "./app/watchNotification";
import { parseGitHubActionsUrl } from "./domain/githubUrl";
import type { WatchRecord } from "./domain/watches";
import { fetchRepositoryIconUrl, fetchWatchState, rerunFailedWatch, resolvePrWatchTargets } from "./platform/gh";
import { sendDesktopNotification } from "./platform/notifications";
import { loadWatches, saveWatches } from "./platform/store";
import { setTrayIndicator } from "./platform/tray";
import "./styles.css";

const pollIntervalMs = 30_000;
const appRoot = document.querySelector<HTMLDivElement>("#app");

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
let popupHeight = popupMinHeight;
const collapsedGroups = createCollapsedGroups();
let pendingWatchAction: PendingWatchAction | undefined;

type PendingWatchAction = {
  id: string;
  kind: "remove" | "rerun";
};

const controller = createWatchController(
  {
    fetchState: isDemoMode
      ? async () => {
          throw new Error("Demo mode does not poll GitHub.");
        }
      : fetchWatchState,
    fetchRepositoryIconUrl: isDemoMode ? async () => undefined : fetchRepositoryIconUrl,
    notify: notifyStatusChange,
    resolvePrWatchTargets: isDemoMode ? async () => [] : resolvePrWatchTargets,
    rerunFailed: isDemoMode ? async () => undefined : rerunFailedWatch,
    save: saveWatches,
  },
  loadInitialWatches(),
);

function notifyStatusChange(notification: WatchNotification): Promise<void> {
  return sendDesktopNotification(notification, undefined, (clickedNotification) => {
    controller.markSeen(clickedNotification.watchId);
  });
}

controller.subscribe(() => {
  render();
  void updateTrayIndicator();
});

render();
void updateTrayIndicator();
void controller.refreshRepositoryIcons();
void controller.refreshWatchMetadata();
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

});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    void hideMainWindow();
  }
});
void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
  if (!focused) {
    markAllSeenStatusChanges();
  }
});

function render(): void {
  const watches = controller.getWatches();
  const viewModel = createPopupViewModel(watches);
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
              title="Clear watches"
              aria-label="Clear watches"
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
                ? `<div class="clear-menu-popover" role="menu">
                    <button type="button" role="menuitem" data-action="clear-all" ${hasWatches ? "" : "disabled"}>Clear all</button>
                    <button type="button" role="menuitem" data-action="clear-finished" ${hasFinishedWatches ? "" : "disabled"}>Clear finished</button>
                  </div>`
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
        viewModel.rows.length === 0
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
          type="url"
          autocomplete="off"
          spellcheck="false"
          placeholder="https://github.com/OWNER/REPO/actions/runs/..."
          aria-label="GitHub Actions URL"
        />
        <div class="add-field-actions">
          <button class="add-form-submit" type="submit">Watch</button>
        </div>
      </div>
      ${addError ? `<p class="form-error">${escapeHtml(addError)}</p>` : ""}
    </form>
  `;
}

function renderWatchGroup(group: WatchGroupViewModel): string {
  const isCollapsed = collapsedGroups.has(group.repoLabel);

  return `
    <li class="watch-group${isCollapsed ? " is-collapsed" : ""}">
      <button
        class="watch-group-toggle"
        type="button"
        data-action="toggle-group"
        data-repo="${escapeHtml(group.repoLabel)}"
        aria-expanded="${isCollapsed ? "false" : "true"}"
      >
        <span class="watch-group-icon" aria-hidden="true">
          ${renderRepoIcon(group)}
        </span>
        <span class="watch-group-meta">
          <span class="watch-group-title">${escapeHtml(group.repoLabel)}</span>
        </span>
        <span class="watch-group-action watch-group-badge" aria-hidden="true">${group.rows.length}</span>
      </button>
      ${
        isCollapsed
          ? ""
          : `<ul class="watch-group-list">
              ${group.rows.map(renderWatch).join("")}
            </ul>`
      }
    </li>
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
    <li class="watch is-${row.tone}${row.unseenStatusChange ? " has-unseen-change" : ""}">
      ${renderStatusIcon(row)}
      <button class="watch-main" type="button" data-action="open" data-id="${escapeHtml(row.id)}" title="Open in GitHub">
        <span class="watch-label">
          <span class="watch-title-text">${escapeHtml(row.label)}</span>
          ${row.prReference ? `<span class="watch-pr-reference">${escapeHtml(row.prReference)}</span>` : ""}
        </span>
        <span class="watch-status">${escapeHtml(row.statusLabel)} - ${escapeHtml(row.description)}</span>
        ${row.timingText ? `<span class="watch-timing">${escapeHtml(row.timingText)}</span>` : ""}
      </button>
      ${renderWatchActions(row)}
    </li>
  `;
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

function renderStatusIcon(row: WatchRowViewModel): string {
  const icon = getStatusIconSvg(row.tone, row.id);
  return `<span class="status-icon status-icon-${row.tone}" aria-hidden="true">${icon}</span>`;
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

async function hideMainWindow(): Promise<void> {
  try {
    markAllSeenStatusChanges();
    await getCurrentWindow().hide();
  } catch (error) {
    console.error("Could not hide GHA Watch window.", error);
  }
}

function markAllSeenStatusChanges(): void {
  if (!createTrayState(controller.getWatches()).hasUnseenChanges) {
    return;
  }

  controller.markAllSeen();
}

async function addWatch(url: string): Promise<void> {
  try {
    const target = parseGitHubActionsUrl(url);
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

function loadInitialWatches(): WatchRecord[] {
  if (isDemoMode) {
    return [
      createDemoWatch("1", "CI / Android (Qt LTS, API 28) (push)", "in_progress", null, true),
      createDemoWatch("2", "E2E / Android (Qt LTS, API 35) (push)", "in_progress", null, true),
      createDemoWatch("3", "CI / Cocoa (Qt latest, macOS-26) (push)", "queued", null, true),
      createDemoWatch("4", "CI / Crashpad (Qt LTS, ubuntu-24.04) (push)", "completed", "success", false),
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
): WatchRecord {
  return {
    id: `getsentry/sentry/run/${runId}`,
    target: {
      kind: "run",
      owner: "getsentry",
      repo: "sentry",
      runId,
      url: `https://github.com/getsentry/sentry/actions/runs/${runId}`,
    },
    label,
    status: conclusion ? `${status}:${conclusion}` : status,
    lastState: { status, conclusion },
    active,
    error: undefined,
  };
}
