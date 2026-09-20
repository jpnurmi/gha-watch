import { decodeWatchRecords } from "../domain/watchRecords";
import { normalizeAppSettings, type AppSettings } from "../domain/settings";
import {
  normalizeWatchSuppressions,
  type WatchSuppression,
} from "../domain/watchSuppressions";
import { getWatchTriageState, type WatchRecord } from "../domain/watches";
import { createTauriShellExecutor, type ShellExecutor, type ShellResult } from "./shell";

const gistDescription = "GHA Watch synced settings";
const gistFilename = "gha-watch-settings.json";
const settingsFormat = "dev.jpnurmi.gha-watch/settings";
const settingsFormatVersion = 2;

type GistFile = {
  content?: string;
  truncated?: boolean;
  raw_url?: string;
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
  watchSuppressions: Record<string, number>;
};

export type SyncedState = {
  settings: AppSettings;
  watches: WatchRecord[];
  watchSuppressions?: WatchSuppression[];
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
  let account: string | undefined;
  let generation = 0;

  async function refreshAccount(): Promise<void> {
    const current = await executor.getAccount?.();
    if (current !== account) {
      account = current;
      gistId = undefined;
      discoveryComplete = false;
      generation++;
    }
  }

  async function discoverGistId(): Promise<{ id: string | undefined; generation: number }> {
    await refreshAccount();
    const started = generation;
    if (discoveryComplete) {
      return { id: gistId, generation: started };
    }

    const result = await executor.execute("gh", [
      "api",
      "--paginate",
      "--slurp",
      "/gists?per_page=100",
    ]);
    await refreshAccount();
    if (generation !== started) return discoverGistId();
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
    return { id: gistId, generation: started };
  }

  return {
    async load() {
      let discovery = await discoverGistId();
      while (discovery.generation !== generation) {
        discovery = await discoverGistId();
      }
      const { id } = discovery;

      if (!id) {
        return undefined;
      }

      const result = await executor.execute("gh", ["api", `/gists/${id}`]);
      assertSuccessfulResult(result);
      const file = parseJson<GistResponse>(result.stdout).files?.[gistFilename];
      if (file?.truncated) {
        const url = new URL(requiredString(file.raw_url, `${gistFilename} raw URL`));
        if (url.protocol !== "https:" || url.hostname !== "gist.githubusercontent.com" ||
            url.port || url.username || url.password) {
          throw new Error("The GHA Watch settings Gist has an invalid raw URL.");
        }
        const raw = await executor.execute("gh", ["api", url.href]);
        assertSuccessfulResult(raw);
        return parseSettingsDocument(raw.stdout);
      }
      return parseSettingsDocument(requiredString(file?.content, `${gistFilename} content`));
    },

    async save(state) {
      const content = serializeSettingsDocument(state);
      let discovery = await discoverGistId();
      while (discovery.generation !== generation) {
        discovery = await discoverGistId();
      }
      const { id } = discovery;
      const files = { [gistFilename]: { content } };

      if (id) {
        const result = await executor.execute("gh", [
          "api",
          "--method",
          "PATCH",
          `/gists/${id}`,
        ], JSON.stringify({ files }));
        assertSuccessfulResult(result);
        return;
      }

      const result = await executor.execute("gh", [
        "api",
        "--method",
        "POST",
        "/gists",
      ], JSON.stringify({ description: gistDescription, public: false, files }));
      assertSuccessfulResult(result);
      const created = requiredString(parseJson<GistResponse>(result.stdout).id, "created Gist id");
      await refreshAccount();
      if (discovery.generation === generation) gistId = created;
    },
  };
}

export function serializeSettingsDocument(state: SyncedState): string {
  const normalized = normalizeAppSettings(state.settings);
  const document: SyncedSettingsDocument = {
    format: settingsFormat,
    version: settingsFormatVersion,
    settings: {
      watchedRepos: normalized.watchedRepos.map(({ repoIconUrl: _repoIconUrl, ...repo }) => repo),
      repoOrder: normalized.repoOrder,
      dismissedPullRequests: normalized.dismissedPullRequests,
    },
    watches: normalizeSyncedWatches(state.watches).map(({ repoIconUrl: _repoIconUrl, ...watch }) => watch),
    watchSuppressions: Object.fromEntries(normalizeWatchSuppressions(state.watchSuppressions)
      .map(({ id, clearedAt }) => [id, Date.parse(clearedAt)])),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseSettingsDocument(content: string): LoadedSyncedState {
  const document = parseJson<unknown>(content);

  if (!isRecord(document) || document.format !== settingsFormat) {
    throw new Error("The GHA Watch settings Gist has an unsupported format.");
  }

  if (document.version !== 1 && document.version !== settingsFormatVersion) {
    throw new Error("The GHA Watch settings Gist has an unsupported version.");
  }

  if (!isRecord(document.settings)) {
    throw new Error("The GHA Watch settings Gist does not contain settings.");
  }

  return {
    settings: normalizeAppSettings(document.settings),
    watches: normalizeSyncedWatches(document.watches),
    watchSuppressions: document.version === 1
      ? normalizeWatchSuppressions(document.watchSuppressions)
      : decodeCompactSuppressions(document.watchSuppressions),
    ...(!Object.hasOwn(document, "watches") ? { historyInitialized: false } : {}),
  };
}

export function normalizeSyncedWatches(value: unknown): WatchRecord[] {
  return decodeWatchRecords(value).filter((watch) => {
    const triageState = getWatchTriageState(watch);
    return triageState === "saved" || triageState === "done";
  });
}

function normalizeGistPages(value: unknown): GistResponse[] {
  if (!Array.isArray(value)) {
    throw new Error("gh returned an invalid Gist list.");
  }

  const pages = value.every(Array.isArray) ? value : [value];
  return pages.flatMap((page) => page.filter(isRecord) as GistResponse[]);
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

function decodeCompactSuppressions(value: unknown): WatchSuppression[] {
  if (!isRecord(value)) return [];
  return normalizeWatchSuppressions(Object.entries(value).flatMap(([id, timestamp]) => {
    if (typeof timestamp !== "number" || !Number.isFinite(new Date(timestamp).getTime())) return [];
    return [{ id, clearedAt: new Date(timestamp).toISOString() }];
  }));
}
