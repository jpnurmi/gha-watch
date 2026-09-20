import type { RerunMode } from "./githubPort";

export function getWatchRerunMode(action: string | undefined): RerunMode | undefined {
  if (action === "rerun-all") {
    return "all";
  }

  return action === "rerun-failed" ? "failed" : undefined;
}
