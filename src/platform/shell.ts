import { invoke } from "@tauri-apps/api/core";
import { createRequestQueue } from "./requestQueue";
import { executeShellCommand } from "./shellCommand";
import { assertSuccessfulGhResult, isMissingProgramError, requiredString } from "./ghProtocol";

export type ShellResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type ShellExecutor = {
  getAccount?(): Promise<string>;
  execute(program: string, args: string[], input?: string): Promise<ShellResult>;
};

let sharedTauriShellExecutor: ShellExecutor | undefined;

export function createTauriShellExecutor(): ShellExecutor {
  if (sharedTauriShellExecutor) {
    return sharedTauriShellExecutor;
  }

  const run = createRequestQueue();
  let account: string | undefined;
  let checkedAt = 0;
  let checking: Promise<string> | undefined;
  sharedTauriShellExecutor = {
    async getAccount() {
      if (account && Date.now() - checkedAt < 60_000) return account;
      checking ??= sharedTauriShellExecutor!.execute("gh", ["api", "user", "--jq", ".login"]).then((result) => {
        assertSuccessfulGhResult(result);
        account = requiredString(result.stdout.trim(), "account login");
        checkedAt = Date.now();
        return account;
      });
      try { return await checking; } finally { checking = undefined; }
    },
    execute(program, args, input) {
      return run(async () => {
        const { Command } = await import("@tauri-apps/plugin-shell");
        const inputPath = input === undefined ? undefined
          : await invoke<string>("create_command_input", { content: input });
        const commands =
          program === "gh"
            ? [
                "gh",
                "gh-homebrew",
                "gh-usrlocal",
                "gh-usrbin",
                "gh-windows-program-files",
                "gh-windows-chocolatey",
              ]
            : [program];
        let lastError: unknown;

        try {
          for (const command of commands) {
            try {
              const output = await executeShellCommand(Command.create(
                command, inputPath ? [...args, "--input", inputPath] : args,
              ));

              return {
                code: output.code ?? 1,
                stdout: output.stdout,
                stderr: output.stderr,
              };
            } catch (error) {
              lastError = error;

              if (!isMissingProgramError(error)) {
                throw error;
              }
            }
          }
          throw lastError;
        } finally {
          if (inputPath) await invoke("remove_command_input", { path: inputPath });
        }
      });
    },
  };

  return sharedTauriShellExecutor;
}
