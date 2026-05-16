import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createCollapsedGroups } from "./app/collapsedGroups";
import { getAddFormActions, getPopupBodySections, type AddFormAction, type PopupBodySection } from "./app/popupLayout";
import { getStatusIconSvg } from "./app/statusIcon";
import { createWatchController } from "./app/watchController";
import { createTrayState } from "./app/trayState";
import { createPopupViewModel, type WatchGroupViewModel, type WatchRowViewModel } from "./app/viewModel";
import { parseGitHubActionsUrl } from "./domain/githubUrl";
import type { WatchRecord } from "./domain/watches";
import { fetchWatchState } from "./platform/gh";
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
const collapsedGroups = createCollapsedGroups();

const controller = createWatchController(
  {
    fetchState: isDemoMode
      ? async () => {
          throw new Error("Demo mode does not poll GitHub.");
        }
      : fetchWatchState,
    notify: sendDesktopNotification,
    save: saveWatches,
  },
  loadInitialWatches(),
);

controller.subscribe(() => {
  render();
  void updateTrayIndicator();
});

render();
void updateTrayIndicator();
window.setInterval(() => {
  void poll();
}, pollIntervalMs);
void poll();
document.addEventListener("click", (event) => {
  if (!isClearMenuOpen) {
    return;
  }

  const target = event.target;

  if (target instanceof Element && target.closest(".clear-menu")) {
    return;
  }

  isClearMenuOpen = false;
  render();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    void hideMainWindow();
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
      <input
        name="url"
        type="url"
        autocomplete="off"
        spellcheck="false"
        placeholder="https://github.com/OWNER/REPO/actions/runs/..."
        aria-label="GitHub Actions URL"
      />
      ${getAddFormActions().map(renderAddFormAction).join("")}
      ${addError ? `<p class="form-error">${escapeHtml(addError)}</p>` : ""}
    </form>
  `;
}

function renderAddFormAction(action: AddFormAction): string {
  if (action === "dismiss") {
    return `
      <button class="add-form-dismiss" type="button" data-action="close-add" title="Cancel" aria-label="Cancel adding watch">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"/>
        </svg>
      </button>
    `;
  }

  return `<button class="add-form-submit" type="submit">Watch</button>`;
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
        <svg class="watch-group-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m6.25 3.75 4.5 4.25-4.5 4.25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
        </svg>
        <span class="watch-group-title">${escapeHtml(group.repoLabel)}</span>
        <span class="watch-group-count">${group.rows.length} ${group.rows.length === 1 ? "check" : "checks"}</span>
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

function renderWatch(row: WatchRowViewModel): string {
  return `
    <li class="watch is-${row.tone}">
      ${renderStatusIcon(row)}
      <button class="watch-main" type="button" data-action="open" data-id="${escapeHtml(row.id)}" title="Open in GitHub">
        <span class="watch-label">${escapeHtml(row.label)}</span>
        <span class="watch-status">${escapeHtml(row.statusLabel)} - ${escapeHtml(row.description)}</span>
      </button>
      <button class="remove-button" type="button" data-action="remove" data-id="${escapeHtml(row.id)}" title="Remove watch" aria-label="Remove ${escapeHtml(row.label)}">&times;</button>
    </li>
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

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="remove"]')) {
    button.addEventListener("click", () => {
      controller.remove(button.dataset.id || "");
    });
  }

  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-action="open"]')) {
    button.addEventListener("click", () => {
      const watch = controller.getWatches().find((item) => item.id === button.dataset.id);

      if (watch) {
        void openUrl(watch.target.url);
      }
    });
  }
}

async function hideMainWindow(): Promise<void> {
  try {
    await getCurrentWindow().hide();
  } catch (error) {
    console.error("Could not hide GHA Watch window.", error);
  }
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
  await setTrayIndicator(summary.status, summary.tooltip);
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
