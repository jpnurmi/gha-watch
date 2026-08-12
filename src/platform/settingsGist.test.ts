import { describe, expect, it } from "vitest";
import type { AppSettings } from "../domain/settings";
import type { ShellExecutor, ShellResult } from "./gh";
import {
  createSettingsGistRemote,
  parseSettingsDocument,
  serializeSettingsDocument,
} from "./settingsGist";

const settings: AppSettings = {
  watchedRepos: [
    { owner: "jpnurmi", repo: "gha-watch", pullRequestScope: "user" },
  ],
  repoOrder: ["jpnurmi/gha-watch"],
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
              content: serializeSettingsDocument(settings),
            },
          },
        }),
        stderr: "",
      },
    ]);

    await expect(createSettingsGistRemote(executor).load()).resolves.toEqual(settings);
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
      ...settings,
      watchedRepos: settings.watchedRepos.map((repo) => ({
        ...repo,
        repoIconUrl: "https://avatars.example/jpnurmi.png",
      })),
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
            "gha-watch-settings.json": { content: serializeSettingsDocument(settings) },
          },
        }),
        stderr: "",
      },
    ]);
    const remote = createSettingsGistRemote(executor);

    await remote.save(settings);
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
    expect(() => parseSettingsDocument(JSON.stringify({ settings }))).toThrow(
      "unsupported format",
    );
    expect(() => parseSettingsDocument(JSON.stringify({
      format: "dev.jpnurmi.gha-watch/settings",
      version: 2,
      settings,
    }))).toThrow("unsupported version");
  });
});
