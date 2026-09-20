import { describe, expect, it } from "vitest";
import type { WatchRecord } from "../domain/watches";
import type { ShellExecutor, ShellResult } from "./gh";
import {
  createSettingsGistRemote,
  normalizeSyncedWatches,
  parseSettingsDocument,
  serializeSettingsDocument,
  type SyncedState,
} from "./settingsGist";

const savedWatch: WatchRecord = {
  id: "jpnurmi/gha-watch/run/123",
  target: {
    kind: "run",
    owner: "jpnurmi",
    repo: "gha-watch",
    runId: "123",
    url: "https://github.com/jpnurmi/gha-watch/actions/runs/123",
  },
  label: "CI",
  status: "completed:success",
  lastSeenStatus: "completed:success",
  lastState: { status: "completed", conclusion: "success" },
  triageState: "saved",
  active: false,
  error: undefined,
};

const state: SyncedState = {
  settings: {
    watchedRepos: [
      { owner: "jpnurmi", repo: "gha-watch", pullRequestScope: "user" },
    ],
    repoOrder: ["jpnurmi/gha-watch"],
    dismissedPullRequests: ["getsentry/relay#123"],
  },
  watches: [savedWatch],
};

function createSequenceExecutor(results: ShellResult[]): {
  executor: ShellExecutor;
  calls: Array<{ program: string; args: string[]; input?: string }>;
} {
  const calls: Array<{ program: string; args: string[]; input?: string }> = [];

  return {
    calls,
    executor: {
      async execute(program, args, input) {
        calls.push({ program, args, ...(input !== undefined ? { input } : {}) });
        const result = results.shift();

        if (!result) {
          throw new Error("No fake result queued.");
        }

        return result;
      },
    },
  };
}

describe("settings Gist", () => {
  it("discovers the newest matching Gist and loads its settings", async () => {
    const { executor, calls } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify([
          [
            {
              id: "older",
              description: "GHA Watch synced settings",
              updated_at: "2026-08-10T10:00:00Z",
              files: { "gha-watch-settings.json": {} },
            },
            {
              id: "newer",
              description: "GHA Watch synced settings",
              updated_at: "2026-08-11T10:00:00Z",
              files: { "gha-watch-settings.json": {} },
            },
            {
              id: "unrelated",
              description: "Other settings",
              updated_at: "2026-08-12T10:00:00Z",
              files: { "gha-watch-settings.json": {} },
            },
          ],
        ]),
        stderr: "",
      },
      {
        code: 0,
        stdout: JSON.stringify({
          id: "newer",
          files: {
            "gha-watch-settings.json": {
              content: serializeSettingsDocument(state),
            },
          },
        }),
        stderr: "",
      },
    ]);

    await expect(createSettingsGistRemote(executor).load()).resolves.toEqual({
      ...state,
      watches: [{ ...savedWatch, errorKind: undefined, errorAt: undefined }],
      watchSuppressions: [],
    });
    expect(calls).toEqual([
      {
        program: "gh",
        args: ["api", "--paginate", "--slurp", "/gists?per_page=100"],
      },
      {
        program: "gh",
        args: ["api", "/gists/newer"],
      },
    ]);
  });

  it("creates an unlisted Gist when none exists", async () => {
    const { executor, calls } = createSequenceExecutor([
      { code: 0, stdout: "[[]]", stderr: "" },
      { code: 0, stdout: JSON.stringify({ id: "created" }), stderr: "" },
    ]);

    await createSettingsGistRemote(executor).save({
      settings: {
        ...state.settings,
        watchedRepos: state.settings.watchedRepos.map((repo) => ({
          ...repo,
          repoIconUrl: "https://avatars.example/jpnurmi.png",
        })),
      },
      watches: [{ ...savedWatch, repoIconUrl: "https://avatars.example/watch.png" }],
    });

    expect(calls[1]).toMatchObject({
      program: "gh",
      args: [
        "api",
        "--method",
        "POST",
        "/gists",
      ],
    });
    expect(JSON.parse(calls[1].input!)).toEqual({
      description: "GHA Watch synced settings",
      public: false,
      files: { "gha-watch-settings.json": { content: serializeSettingsDocument(state) } },
    });
    expect(calls[1].input).not.toContain("repoIconUrl");
  });

  it("updates a discovered Gist and reuses its id", async () => {
    const { executor, calls } = createSequenceExecutor([
      {
        code: 0,
        stdout: JSON.stringify([[
          {
            id: "existing",
            description: "GHA Watch synced settings",
            files: { "gha-watch-settings.json": {} },
          },
        ]]),
        stderr: "",
      },
      { code: 0, stdout: JSON.stringify({ id: "existing" }), stderr: "" },
      {
        code: 0,
        stdout: JSON.stringify({
          id: "existing",
          files: {
            "gha-watch-settings.json": { content: serializeSettingsDocument(state) },
          },
        }),
        stderr: "",
      },
    ]);
    const remote = createSettingsGistRemote(executor);

    await remote.save(state);
    await remote.load();

    expect(calls).toHaveLength(3);
    expect(calls[1].args).toEqual([
      "api",
      "--method",
      "PATCH",
      "/gists/existing",
    ]);
    expect(JSON.parse(calls[1].input!)).toEqual({
      files: { "gha-watch-settings.json": { content: serializeSettingsDocument(state) } },
    });
    expect(calls[2].args).toEqual(["api", "/gists/existing"]);
  });

  it("rejects unrelated or unsupported documents", () => {
    expect(() => parseSettingsDocument(JSON.stringify({ settings: state.settings }))).toThrow(
      "unsupported format",
    );
    expect(() => parseSettingsDocument(JSON.stringify({
      format: "dev.jpnurmi.gha-watch/settings",
      version: 3,
      settings: state.settings,
    }))).toThrow("unsupported version");
  });

  it("loads older settings-only documents with empty synced history", () => {
    expect(parseSettingsDocument(JSON.stringify({
      format: "dev.jpnurmi.gha-watch/settings",
      version: 1,
      settings: state.settings,
    }))).toEqual({
      settings: state.settings,
      watches: [],
      watchSuppressions: [],
      historyInitialized: false,
    });
  });

  it("round-trips compact watch suppressions", () => {
    const watchSuppressions = [
      {
        id: "jpnurmi/gha-watch/pull/456",
        clearedAt: "2026-08-31T12:00:00.000Z",
      },
    ];

    expect(parseSettingsDocument(serializeSettingsDocument({
      ...state,
      watchSuppressions,
    })).watchSuppressions).toEqual(watchSuppressions);
  });

  it("ignores malformed and inbox watch records", () => {
    expect(normalizeSyncedWatches([
      savedWatch,
      { ...savedWatch, id: "wrong" },
      { ...savedWatch, triageState: "inbox" },
      { ...savedWatch, target: { kind: "run" } },
    ])).toEqual([savedWatch]);
  });

  it.each([
    { operation: "load", overlap: false },
    { operation: "save", overlap: false },
    { operation: "load", overlap: true },
    { operation: "save", overlap: true },
  ])("retries $operation after an account switch (overlapping discovery: $overlap)", async ({ operation, overlap }) => {
    let account = "first";
    let release!: (result: ShellResult) => void;
    let started!: () => void;
    const pending = new Promise<ShellResult>((resolve) => { release = resolve; });
    const discovering = new Promise<void>((resolve) => { started = resolve; });
    const requests: Array<{ method: string; id: string }> = [];
    const remote = createSettingsGistRemote({
      getAccount: async () => account,
      async execute(_program, args) {
        if (args.includes("/gists?per_page=100")) {
          if (account === "first") {
            started();
            return pending;
          }
          return gistList(account);
        }
        const path = args.find((arg) => arg.startsWith("/gists/"))!;
        const id = path.slice("/gists/".length);
        requests.push({ method: args.includes("PATCH") ? "PATCH" : "GET", id });
        return gistResult(id);
      },
    });

    const first = operation === "load" ? remote.load() : remote.save(state);
    await discovering;
    account = "second";
    if (overlap) await remote.load();
    release(gistList("first"));
    await first;
    await remote.load();

    expect(requests).toEqual([
      ...(overlap ? [{ method: "GET", id: "second" }] : []),
      { method: operation === "load" ? "GET" : "PATCH", id: "second" },
      { method: "GET", id: "second" },
    ]);
  });

  it("does not cache a created Gist under a different account", async () => {
    let account = "first";
    let release!: (result: ShellResult) => void;
    let started!: () => void;
    const pending = new Promise<ShellResult>((resolve) => { release = resolve; });
    const creating = new Promise<void>((resolve) => { started = resolve; });
    const requests: string[] = [];
    const remote = createSettingsGistRemote({
      getAccount: async () => account,
      async execute(_program, args) {
        if (args.includes("/gists?per_page=100")) {
          return account === "first" ? { code: 0, stdout: "[[]]", stderr: "" } : gistList(account);
        }
        if (args.includes("POST")) {
          started();
          return pending;
        }
        const path = args.find((arg) => arg.startsWith("/gists/"))!;
        requests.push(path);
        return gistResult(path.slice("/gists/".length));
      },
    });

    const saving = remote.save(state);
    await creating;
    account = "second";
    await remote.load();
    release(gistResult("created"));
    await saving;
    await remote.load();

    expect(requests).toEqual(["/gists/second", "/gists/second"]);
  });

  it("migrates legacy suppressions to an ID and timestamp map", () => {
    const watchSuppressions = [
      { id: savedWatch.id, clearedAt: "2025-01-01T00:00:00.000Z" },
    ];
    const legacy = JSON.stringify({
      format: "dev.jpnurmi.gha-watch/settings", version: 1,
      ...state, watchSuppressions,
    });
    const migrated = JSON.parse(serializeSettingsDocument(parseSettingsDocument(legacy)));

    expect(migrated.version).toBe(2);
    expect(migrated.watchSuppressions).toEqual({ [savedWatch.id]: Date.parse(watchSuppressions[0].clearedAt) });
    expect(parseSettingsDocument(JSON.stringify(migrated)).watchSuppressions).toEqual(watchSuppressions);
  });

  it("uploads a large compact history outside command arguments", async () => {
    const watchSuppressions = Array.from({ length: 20_000 }, (_, index) => ({
      id: `jpnurmi/gha-watch/run/${index}`,
      clearedAt: "2025-01-01T00:00:00.000Z",
    }));
    const { executor, calls } = createSequenceExecutor([
      gistList("existing"),
      { code: 0, stdout: "{}", stderr: "" },
    ]);
    await createSettingsGistRemote(executor).save({ ...state, watchSuppressions });
    const content = JSON.parse(calls[1].input!).files["gha-watch-settings.json"].content;

    expect(content.length).toBeLessThan(1_200_000);
    expect(content.length).toBeGreaterThan(128_000);
    expect(calls[1].args).toEqual(["api", "--method", "PATCH", "/gists/existing"]);
    expect(parseSettingsDocument(content).watchSuppressions).toEqual(watchSuppressions);
  });

  it("loads full content when GitHub truncates the Gist response", async () => {
    const rawUrl = "https://gist.githubusercontent.com/octocat/6cad326836d38bd3a7ae/raw/db9c55113504e46fa076e7df3a04ce592e2e86d8/hello_world.rb";
    const { executor, calls } = createSequenceExecutor([
      gistList("existing"),
      { code: 0, stdout: JSON.stringify({ files: { "gha-watch-settings.json": {
        content: "{", truncated: true, raw_url: rawUrl,
      } } }), stderr: "" },
      { code: 0, stdout: serializeSettingsDocument(state), stderr: "" },
    ]);

    expect(await createSettingsGistRemote(executor).load()).toEqual(parseSettingsDocument(serializeSettingsDocument(state)));
    expect(calls[2].args).toEqual(["api", rawUrl]);
  });

  it("does not follow an untrusted raw URL", async () => {
    const { executor, calls } = createSequenceExecutor([
      gistList("existing"),
      { code: 0, stdout: JSON.stringify({ files: { "gha-watch-settings.json": {
        truncated: true, raw_url: "https://github.com/jpnurmi/gha-watch",
      } } }), stderr: "" },
    ]);

    await expect(createSettingsGistRemote(executor).load()).rejects.toThrow("invalid raw URL");
    expect(calls).toHaveLength(2);
  });
});

function gistList(id: string): ShellResult {
  return {
    code: 0,
    stdout: JSON.stringify([[{
      id,
      description: "GHA Watch synced settings",
      files: { "gha-watch-settings.json": {} },
    }]]),
    stderr: "",
  };
}

function gistResult(id: string): ShellResult {
  return {
    code: 0,
    stdout: JSON.stringify({
      id,
      files: { "gha-watch-settings.json": { content: serializeSettingsDocument(state) } },
    }),
    stderr: "",
  };
}

describe("synced watch notes", () => {
  it("preserves notes through serialization", () => {
    const watch = { ...savedWatch, note: "Deploy after CI passes\nCheck the release tag" };
    expect(parseSettingsDocument(serializeSettingsDocument({ ...state, watches: [watch] })).watches)
      .toEqual([watch]);
  });
});
