import { describe, expect, it, vi } from "vitest";
import { parseGitHubActionsUrl, type ParsedGitHubTarget } from "../domain/githubUrl";
import { addWatch, type WatchRecord } from "../domain/watches";
import { addWatchFromClipboard, getSafeClipboardPrefill } from "./clipboardWatch";

describe("addWatchFromClipboard", () => {
  it("reads once and passes valid text through the existing parser", async () => {
    const readText = vi.fn(async () => "  https://github.com/getsentry/sentry/actions/runs/123  ");
    const parseInput = vi.fn(async (input: string) => parseGitHubActionsUrl(input));
    const addTarget = vi.fn(async () => undefined);

    await expect(addWatchFromClipboard({ addTarget, parseInput, readText })).resolves.toMatchObject({
      status: "added",
      target: { kind: "run", owner: "getsentry", repo: "sentry", runId: "123" },
    });
    expect(readText).toHaveBeenCalledOnce();
    expect(parseInput).toHaveBeenCalledWith("https://github.com/getsentry/sentry/actions/runs/123");
    expect(addTarget).toHaveBeenCalledOnce();
  });

  it("does not add or otherwise act on invalid clipboard text", async () => {
    const addTarget = vi.fn(async () => undefined);

    await expect(
      addWatchFromClipboard({
        addTarget,
        parseInput: async () => {
          throw new Error("Not a GitHub watch target");
        },
        readText: async () => "rm -rf /",
      }),
    ).resolves.toEqual({
      status: "invalid",
      error: "Not a GitHub watch target",
      prefill: "rm -rf /",
    });
    expect(addTarget).not.toHaveBeenCalled();
  });

  it("degrades safely when clipboard access is denied or empty", async () => {
    await expect(
      addWatchFromClipboard({
        addTarget: async () => undefined,
        parseInput: async () => parseGitHubActionsUrl("owner/repo"),
        readText: async () => {
          throw new Error("permission denied");
        },
      }),
    ).resolves.toEqual({
      status: "unavailable",
      error: "Could not read the clipboard: permission denied",
      prefill: "",
    });

    const parseInput = vi.fn<() => Promise<ParsedGitHubTarget>>();
    await expect(
      addWatchFromClipboard({
        addTarget: async () => undefined,
        parseInput,
        readText: async () => "   ",
      }),
    ).resolves.toMatchObject({ status: "empty", prefill: "" });
    expect(parseInput).not.toHaveBeenCalled();
  });

  it("relies on the normal watch path to avoid duplicates", async () => {
    let watches: WatchRecord[] = [];
    const dependencies = {
      async addTarget(target: ParsedGitHubTarget) {
        if (target.kind !== "repo") {
          watches = addWatch(watches, target);
        }
      },
      async parseInput(input: string) {
        return parseGitHubActionsUrl(input);
      },
      async readText() {
        return "https://github.com/getsentry/sentry/actions/runs/123";
      },
    };

    await addWatchFromClipboard(dependencies);
    await addWatchFromClipboard(dependencies);

    expect(watches).toHaveLength(1);
  });

  it("does not prefill oversized or control-character clipboard content", () => {
    expect(getSafeClipboardPrefill("x".repeat(2_049))).toBe("");
    expect(getSafeClipboardPrefill("owner/repo\u0000suffix")).toBe("");
    expect(getSafeClipboardPrefill("owner/repo#123")).toBe("owner/repo#123");
  });
});
