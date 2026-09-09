import { afterEach, describe, expect, it, vi } from "vitest";
import { Command, EventEmitter, type CommandEvents, type OutputEvents } from "@tauri-apps/plugin-shell";
import { createRequestQueue } from "./requestQueue";
import { executeShellCommand, ShellTimeoutError } from "./shellCommand";
import { fetchConditionalApiJson } from "./conditionalApi";
import { createSettingsGistRemote } from "./settingsGist";

afterEach(() => vi.useRealTimers());

describe("GitHub transport", () => {
  it("shares a bounded budget and releases slots after failure", async () => {
    const run = createRequestQueue(2);
    const release: Array<() => void> = [];
    let active = 0;
    let maximum = 0;
    const requests = Array.from({ length: 5 }, (_, index) => run(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => release.push(resolve));
      active--;
      if (index === 0) throw new Error("failed");
    }));
    const settled = Promise.allSettled(requests);
    expect(release).toHaveLength(2);
    for (let index = 0; index < 5; index++) {
      await vi.waitFor(() => expect(release[index]).toBeDefined());
      release[index]();
    }
    expect((await settled).filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(maximum).toBe(2);
  });

  it("kills a timed-out child and reports a typed failure", async () => {
    vi.useFakeTimers();
    const kill = vi.fn(async () => {});
    const events = new EventEmitter<CommandEvents>();
    const command = Object.assign(events, {
      stdout: new EventEmitter<OutputEvents<string>>(), stderr: new EventEmitter<OutputEvents<string>>(),
      spawn: async () => ({ kill }),
    }) as unknown as Command<string>;
    const result = executeShellCommand(command, 100);
    const rejected = expect(result).rejects.toBeInstanceOf(ShellTimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(kill).toHaveBeenCalledOnce();
    expect(events.listenerCount("close")).toBe(0);
  });

  it("does not reuse conditional responses across accounts", async () => {
    let account = "first";
    const headers: string[][] = [];
    const executor = {
      getAccount: async () => account,
      execute: async (_program: string, args: string[]) => {
        headers.push(args);
        return { code: 0, stdout: 'HTTP/2.0 200 OK\nETag: "abc"\n\n{"ok":true}', stderr: "" };
      },
    };
    await fetchConditionalApiJson(executor, ["repos/getsentry/sentry"]);
    account = "second";
    await fetchConditionalApiJson(executor, ["repos/getsentry/sentry"]);
    expect(headers[1]).not.toContain("If-None-Match: \"abc\"");
  });

  it("rediscovers the settings Gist after the account changes", async () => {
    let account = "first";
    const executor = { getAccount: async () => account, execute: vi.fn(async () => ({ code: 0, stdout: "[]", stderr: "" })) };
    const remote = createSettingsGistRemote(executor);
    await remote.load();
    await remote.load();
    expect(executor.execute).toHaveBeenCalledOnce();
    account = "second";
    await remote.load();
    expect(executor.execute).toHaveBeenCalledTimes(2);
  });

  it("preserves stdout and stderr", async () => {
    const events = new EventEmitter<CommandEvents>();
    const command = Object.assign(events, {
      stdout: new EventEmitter<OutputEvents<string>>(), stderr: new EventEmitter<OutputEvents<string>>(),
      spawn: async () => ({ kill: async () => {} }),
    }) as unknown as Command<string>;
    const result = executeShellCommand(command);
    command.stdout.emit("data", "first\n");
    command.stdout.emit("data", "second\r\n");
    command.stdout.emit("data", "last");
    command.stderr.emit("data", "warning\r\n");
    command.stderr.emit("data", "details");
    events.emit("close", { code: 0, signal: null });

    await expect(result).resolves.toEqual({
      code: 0,
      stdout: "first\nsecond\r\nlast",
      stderr: "warning\r\ndetails",
    });
  });

  it.each(["\n", "\r\n"])("parses streamed HTTP responses with %j header line endings", async (ending) => {
    const events = new EventEmitter<CommandEvents>();
    const command = Object.assign(events, {
      stdout: new EventEmitter<OutputEvents<string>>(), stderr: new EventEmitter<OutputEvents<string>>(),
      async spawn() {
        command.stdout.emit("data", "HTTP/2.0 200 OK\n");
        command.stdout.emit("data", `Etag: "abc"${ending}`);
        command.stdout.emit("data", ending);
        command.stdout.emit("data", '{"ok":true}');
        events.emit("close", { code: 0, signal: null });
        return { kill: async () => {} };
      },
    }) as unknown as Command<string>;
    const executor = { execute: () => executeShellCommand(command) };

    await expect(fetchConditionalApiJson(executor, ["repos/getsentry/sentry"])).resolves.toEqual({ ok: true });
  });
});
