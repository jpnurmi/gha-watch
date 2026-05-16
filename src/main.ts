import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createWatchController } from "./app/watchController";
import { createPopupViewModel, type WatchRowViewModel } from "./app/viewModel";
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

function render(): void {
  const watches = controller.getWatches();
  const summary = getSummary(watches);
  const viewModel = createPopupViewModel(watches);

  app.innerHTML = `
    <section class="shell">
      <header class="header">
        <div>
          <h1>${escapeHtml(viewModel.title)}</h1>
          <p>${escapeHtml(viewModel.subtitle)}</p>
        </div>
        <div class="header-actions">
          <button class="icon-button" type="button" data-action="toggle-add" title="Add watch" aria-label="Add watch">+</button>
          <button class="plain-button" type="button" data-action="close" title="Close" aria-label="Close">x</button>
        </div>
      </header>

      ${isAdding ? renderAddForm() : ""}

      <ul class="watch-list">
        ${
          viewModel.rows.length === 0
            ? `<li class="empty">No watches yet.</li>`
            : viewModel.rows.map(renderWatch).join("")
        }
      </ul>
    </section>
  `;

  bindEvents();
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
      <button type="submit">Watch</button>
      ${addError ? `<p class="form-error">${escapeHtml(addError)}</p>` : ""}
    </form>
  `;
}

function renderWatch(row: WatchRowViewModel): string {
  return `
    <li class="watch is-${row.tone}">
      <span class="status-glyph" aria-hidden="true"></span>
      <span class="provider-mark" aria-hidden="true">GH</span>
      <button class="watch-main" type="button" data-action="open" data-id="${escapeHtml(row.id)}" title="Open in GitHub">
        <span class="watch-label">${escapeHtml(row.label)}</span>
        <span class="watch-status">${escapeHtml(row.statusLabel)} - ${escapeHtml(row.description)}</span>
      </button>
      <button class="details-button" type="button" data-action="open" data-id="${escapeHtml(row.id)}">Details</button>
      <button class="remove-button" type="button" data-action="remove" data-id="${escapeHtml(row.id)}" title="Remove watch" aria-label="Remove ${escapeHtml(row.label)}">x</button>
    </li>
  `;
}

function bindEvents(): void {
  app.querySelector<HTMLButtonElement>('[data-action="toggle-add"]')?.addEventListener(
    "click",
    () => {
      isAdding = !isAdding;
      addError = undefined;
      render();
      app.querySelector<HTMLInputElement>('input[name="url"]')?.focus();
    },
  );

  app.querySelector<HTMLButtonElement>('[data-action="close"]')?.addEventListener("click", () => {
    void getCurrentWindow().hide();
  });

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

async function addWatch(url: string): Promise<void> {
  try {
    const target = parseGitHubActionsUrl(url);
    await controller.add(target);
    isAdding = false;
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
  const summary = getSummary(controller.getWatches());
  await setTrayIndicator(summary.indicator, summary.tooltip);
}

function getSummary(watches: WatchRecord[]): {
  indicator: string;
  label: string;
  tooltip: string;
} {
  const active = watches.filter((watch) => watch.active);
  const errors = watches.filter((watch) => Boolean(watch.error));
  const failures = watches.filter(
    (watch) => watch.lastState?.status === "completed" && watch.lastState.conclusion !== "success",
  );

  if (errors.length > 0 || failures.length > 0) {
    return {
      indicator: "GHA !",
      label: `${errors.length + failures.length} watch issue`,
      tooltip: "GHA Watch has failed or errored watches",
    };
  }

  if (active.length > 0) {
    return {
      indicator: "GHA ...",
      label: `${active.length} active watch${active.length === 1 ? "" : "es"}`,
      tooltip: `GHA Watch: ${active.length} active watch${active.length === 1 ? "" : "es"}`,
    };
  }

  return {
    indicator: "GHA",
    label: watches.length === 0 ? "No watches" : "All watches complete",
    tooltip: "GHA Watch",
  };
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
