import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { Command } from "@tauri-apps/plugin-shell";
import { executeShellCommand } from "./shellCommand";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-shell", () => ({ Command: { create: vi.fn() } }));
vi.mock("./shellCommand", () => ({ executeShellCommand: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.mocked(invoke).mockResolvedValue("/tmp/request.json");
});

describe("shell request bodies", () => {
  it.each([false, true])("cleans up a large body after execution (failure: %s)", async (failure) => {
    const { createTauriShellExecutor } = await import("./shell");
    const body = JSON.stringify({ content: "history".repeat(200_000) });
    const output = { code: 0, stdout: "{}", stderr: "" };
    if (failure) vi.mocked(executeShellCommand).mockRejectedValue(new Error("timed out"));
    else vi.mocked(executeShellCommand).mockResolvedValue(output);

    const result = createTauriShellExecutor().execute("gh", ["api", "--method", "PATCH", "/gists/existing"], body);
    if (failure) await expect(result).rejects.toThrow("timed out");
    else await expect(result).resolves.toEqual(output);

    expect(invoke).toHaveBeenNthCalledWith(1, "create_command_input", { content: body });
    expect(Command.create).toHaveBeenCalledWith("gh", [
      "api", "--method", "PATCH", "/gists/existing", "--input", "/tmp/request.json",
    ]);
    expect(invoke).toHaveBeenNthCalledWith(2, "remove_command_input", { path: "/tmp/request.json" });
  });

  it("keeps the body until an alternate gh executable finishes", async () => {
    const { createTauriShellExecutor } = await import("./shell");
    vi.mocked(executeShellCommand)
      .mockRejectedValueOnce(new Error("program not found"))
      .mockResolvedValueOnce({ code: 0, stdout: "{}", stderr: "" });

    await createTauriShellExecutor().execute("gh", ["api"], "{}");

    expect(Command.create).toHaveBeenNthCalledWith(1, "gh", ["api", "--input", "/tmp/request.json"]);
    expect(Command.create).toHaveBeenNthCalledWith(2, "gh-homebrew", ["api", "--input", "/tmp/request.json"]);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
