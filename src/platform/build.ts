import { invokeDesktop } from "./desktop";

export function getBuildSha(): Promise<string> {
  return invokeDesktop("get_build_sha");
}
