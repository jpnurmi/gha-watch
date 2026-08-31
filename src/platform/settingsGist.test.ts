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
  calls: Array<{ program: string; args: string[] }>;
} {
  const calls: Array<{ program: string; args: string[] }> = [];

  return {
    calls,
    executor: {
      async execute(program, args) {
        calls.push({ program, args });
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
        "--raw-field",
        "description=GHA Watch synced settings",
        "--field",
        "public=false",
        "--raw-field",
        expect.stringContaining("files[gha-watch-settings.json][content]="),
      ],
    });
    expect(calls[1].args.at(-1)).not.toContain("repoIconUrl");
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
      "--raw-field",
      expect.stringContaining("files[gha-watch-settings.json][content]="),
    ]);
    expect(calls[2].args).toEqual(["api", "/gists/existing"]);
  });

  it("rejects unrelated or unsupported documents", () => {
    expect(() => parseSettingsDocument(JSON.stringify({ settings: state.settings }))).toThrow(
      "unsupported format",
    );
    expect(() => parseSettingsDocument(JSON.stringify({
      format: "dev.jpnurmi.gha-watch/settings",
      version: 2,
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
});
