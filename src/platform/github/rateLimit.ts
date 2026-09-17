import { parseIncludedGhResponse } from "../conditionalApi";
import type { ShellExecutor, ShellResult } from "../shell";
import type { RateLimit } from "./responses";

const quotas = new WeakMap<ShellExecutor, { account: string; quota: RateLimit }>();

export async function executeGraphql(executor: ShellExecutor, args: string[]): Promise<ShellResult> {
  const account = await executor.getAccount?.() ?? "default";
  const result = await executor.execute("gh", [...args, "--include"]);
  const response = parseIncludedGhResponse(result.stdout);
  if (!response) return result;

  const read = (name: string) => {
    const value = response.headers.match(new RegExp(`^x-ratelimit-${name}:\\s*(\\d+)\\s*$`, "im"))?.[1];
    return value === undefined ? NaN : Number(value);
  };
  const limit = read("limit");
  const remaining = read("remaining");
  const used = read("used");
  const reset = read("reset");
  if (limit > 0 && [limit, remaining, used, reset].every(Number.isFinite)) {
    const previous = quotas.get(executor);
    if (!previous || previous.account !== account || reset > previous.quota.reset ||
      (reset === previous.quota.reset && used >= previous.quota.used)) {
      quotas.set(executor, { account, quota: { resource: "GraphQL", limit, remaining, used, reset } });
    }
  }

  return { ...result, stdout: response.body };
}

export async function getGraphqlRateLimit(executor: ShellExecutor): Promise<RateLimit | undefined> {
  const account = await executor.getAccount?.() ?? "default";
  const cached = quotas.get(executor);
  if (cached?.account === account && cached.quota.reset > Date.now() / 1000) return cached.quota;
  return undefined;
}
