import type { ParsedGitHubTarget } from "../domain/githubUrl";

const clipboardPrefillLimit = 2_048;

export type ClipboardWatchResult =
  | { status: "added"; target: ParsedGitHubTarget }
  | { status: "empty"; error: string; prefill: "" }
  | { status: "invalid" | "unavailable"; error: string; prefill: string };

export type ClipboardWatchDependencies = {
  addTarget(target: ParsedGitHubTarget): Promise<void>;
  parseInput(input: string): Promise<ParsedGitHubTarget>;
  readText(): Promise<string>;
};

export async function addWatchFromClipboard(
  dependencies: ClipboardWatchDependencies,
): Promise<ClipboardWatchResult> {
  let clipboardText: string;

  try {
    clipboardText = await dependencies.readText();
  } catch (error) {
    return {
      status: "unavailable",
      error: `Could not read the clipboard: ${getErrorMessage(error)}`,
      prefill: "",
    };
  }

  const input = clipboardText.trim();

  if (!input) {
    return {
      status: "empty",
      error: "The clipboard does not contain a GitHub repository, run, job, or pull request.",
      prefill: "",
    };
  }

  let target: ParsedGitHubTarget;

  try {
    target = await dependencies.parseInput(input);
  } catch (error) {
    return {
      status: "invalid",
      error: getErrorMessage(error),
      prefill: getSafeClipboardPrefill(input),
    };
  }

  try {
    await dependencies.addTarget(target);
    return { status: "added", target };
  } catch (error) {
    return {
      status: "invalid",
      error: getErrorMessage(error),
      prefill: getSafeClipboardPrefill(input),
    };
  }
}

export function getSafeClipboardPrefill(input: string): string {
  if (input.length > clipboardPrefillLimit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input)) {
    return "";
  }

  return input;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
