import type { Command } from "@tauri-apps/plugin-shell";
import type { ShellResult } from "./shell";

export class ShellTimeoutError extends Error {
  readonly code = "timeout";
  constructor() {
    super("GitHub CLI command timed out.");
    this.name = "ShellTimeoutError";
  }
}

export async function executeShellCommand(command: Command<string>, timeoutMs = 30_000): Promise<ShellResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  command.stdout.on("data", (line) => stdout.push(line));
  command.stderr.on("data", (line) => stderr.push(line));
  let resolve!: (result: ShellResult) => void;
  let reject!: (error: unknown) => void;
  const finished = new Promise<ShellResult>((accept, fail) => { resolve = accept; reject = fail; });
  let timedOut = false;
  command.on("close", (result) => {
    if (timedOut) reject(new ShellTimeoutError());
    else resolve({ code: result.code ?? 1, stdout: stdout.join("\n"), stderr: stderr.join("\n") });
  });
  command.on("error", reject);
  // observe errors that arrive before spawn resolves
  void finished.catch(() => {});
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const child = await command.spawn();
    timeout = setTimeout(() => {
      timedOut = true;
      void child.kill().then(
        () => reject(new ShellTimeoutError()),
        (error) => reject(new Error("Could not stop the timed-out GitHub CLI command.", { cause: error })),
      );
    }, timeoutMs);
    return await finished;
  } finally {
    clearTimeout(timeout);
    command.removeAllListeners();
    command.stdout.removeAllListeners();
    command.stderr.removeAllListeners();
  }
}
