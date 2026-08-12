import { normalizeAppSettings, type AppSettings } from "../domain/settings";
import { getWatchId, getWatchTriageState, type WatchRecord } from "../domain/watches";
import { createTauriShellExecutor, type ShellExecutor, type ShellResult } from "./gh";

const gistDescription = "GHA Watch synced settings";
const gistFilename = "gha-watch-settings.json";
const settingsFormat = "dev.jpnurmi.gha-watch/settings";
const settingsFormatVersion = 1;

type GistFile = {
  content?: string;
};

type GistResponse = {
  id?: string;
  description?: string | null;
  updated_at?: string;
  files?: Record<string, GistFile>;
};

type SyncedSettingsDocument = {
  format: typeof settingsFormat;
  version: typeof settingsFormatVersion;
  settings: AppSettings;
  watches?: WatchRecord[];
};

export type SyncedState = {
  settings: AppSettings;
  watches: WatchRecord[];
};

export type LoadedSyncedState = SyncedState & {
  historyInitialized?: boolean;
};

export type SettingsRemote = {
  load(): Promise<LoadedSyncedState | undefined>;
  save(state: SyncedState): Promise<void>;
};

export function createSettingsGistRemote(
  executor: ShellExecutor = createTauriShellExecutor(),
): SettingsRemote {
  let gistId: string | undefined;
  let discoveryComplete = false;

  async function discoverGistId(): Promise<string | undefined> {
    if (discoveryComplete) {
      return gistId;
    }

    const result = await executor.execute("gh", [
      "api",
      "--paginate",
      "--slurp",
      "/gists?per_page=100",
    ]);
    assertSuccessfulResult(result);

    const pages = parseJson<unknown>(result.stdout);
    const gists = normalizeGistPages(pages)
      .filter((gist) =>
        Boolean(gist.id) &&
        gist.description === gistDescription &&
        Boolean(gist.files?.[gistFilename])
      )
      .sort((left, right) => getTimestamp(right.updated_at) - getTimestamp(left.updated_at));

    gistId = gists[0]?.id;
    discoveryComplete = true;
    return gistId;
  }

  return {
    async load() {
      const id = await discoverGistId();

      if (!id) {
        return undefined;
      }

      const result = await executor.execute("gh", ["api", `/gists/${id}`]);
      assertSuccessfulResult(result);
      return parseSettingsDocument(getGistContent(parseJson<GistResponse>(result.stdout)));
    },

    async save(state) {
      const content = serializeSettingsDocument(state);
      const id = await discoverGistId();

      if (id) {
        const result = await executor.execute("gh", [
          "api",
          "--method",
          "PATCH",
          `/gists/${id}`,
          "--raw-field",
          `files[${gistFilename}][content]=${content}`,
        ]);
        assertSuccessfulResult(result);
        return;
      }

      const result = await executor.execute("gh", [
        "api",
        "--method",
        "POST",
        "/gists",
        "--raw-field",
        `description=${gistDescription}`,
        "--field",
        "public=false",
        "--raw-field",
        `files[${gistFilename}][content]=${content}`,
      ]);
      assertSuccessfulResult(result);
      gistId = requiredString(parseJson<GistResponse>(result.stdout).id, "created Gist id");
    },
  };
}

export function serializeSettingsDocument(state: SyncedState): string {
  const normalized = normalizeAppSettings(state.settings);
  const document: SyncedSettingsDocument = {
    format: settingsFormat,
    version: settingsFormatVersion,
    settings: {
      globalAddShortcut: normalized.globalAddShortcut,
      watchedRepos: normalized.watchedRepos.map(({ repoIconUrl: _repoIconUrl, ...repo }) => repo),
      repoOrder: normalized.repoOrder,
    },
    watches: normalizeSyncedWatches(state.watches).map(({ repoIconUrl: _repoIconUrl, ...watch }) => watch),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseSettingsDocument(content: string): LoadedSyncedState {
  const document = parseJson<unknown>(content);

  if (!isRecord(document) || document.format !== settingsFormat) {
    throw new Error("The GHA Watch settings Gist has an unsupported format.");
  }

  if (document.version !== settingsFormatVersion) {
    throw new Error("The GHA Watch settings Gist has an unsupported version.");
  }

  if (!isRecord(document.settings)) {
    throw new Error("The GHA Watch settings Gist does not contain settings.");
  }

  return {
    settings: normalizeAppSettings(document.settings),
    watches: normalizeSyncedWatches(document.watches),
    ...(!Object.hasOwn(document, "watches") ? { historyInitialized: false } : {}),
  };
}

export function normalizeSyncedWatches(value: unknown): WatchRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const watches: WatchRecord[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || !isWatchTarget(item.target)) {
      continue;
    }

    const triageState = getWatchTriageState(item as WatchRecord);
    const id = getWatchId(item.target);

    if (
      (triageState !== "saved" && triageState !== "done") ||
      item.id !== id ||
      seen.has(id) ||
      typeof item.label !== "string" ||
      typeof item.status !== "string" ||
      typeof item.active !== "boolean"
    ) {
      continue;
    }

    seen.add(id);
    watches.push({
      ...(item as WatchRecord),
      id,
      target: item.target,
      label: item.label,
      status: item.status,
      lastState: isRecord(item.lastState) ? item.lastState as WatchRecord["lastState"] : undefined,
      triageState,
      active: item.active,
      error: typeof item.error === "string" ? item.error : undefined,
    });
  }

  return watches;
}

function normalizeGistPages(value: unknown): GistResponse[] {
  if (!Array.isArray(value)) {
    throw new Error("gh returned an invalid Gist list.");
  }

  const pages = value.every(Array.isArray) ? value : [value];
  return pages.flatMap((page) => page.filter(isRecord) as GistResponse[]);
}

function getGistContent(gist: GistResponse): string {
  const content = gist.files?.[gistFilename]?.content;
  return requiredString(content, `${gistFilename} content`);
}

function getTimestamp(value: string | undefined): number {
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function requiredString(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`gh returned a response without ${label}.`);
  }

  return value;
}

function parseJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error("gh returned invalid JSON.");
  }
}

function assertSuccessfulResult(result: ShellResult): void {
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `gh exited with status ${result.code}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWatchTarget(value: unknown): value is WatchRecord["target"] {
  if (!isRecord(value)) {
    return false;
  }

  const hasBase =
    typeof value.owner === "string" &&
    typeof value.repo === "string" &&
    typeof value.url === "string";

  if (!hasBase) {
    return false;
  }

  if (value.kind === "run") {
    return typeof value.runId === "string";
  }

  if (value.kind === "job") {
    return typeof value.jobId === "string";
  }

  return value.kind === "pr" && typeof value.prNumber === "string";
}
