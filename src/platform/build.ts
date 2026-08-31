import { invoke } from "@tauri-apps/api/core";

export function getBuildSha(): Promise<string> {
  return invoke<string>("get_build_sha");
}
