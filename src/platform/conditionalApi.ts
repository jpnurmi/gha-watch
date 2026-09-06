import type { ShellExecutor } from "./shell";
import { parseJson, assertSuccessfulGhResult } from "./ghProtocol";

type ConditionalApiCacheEntry = {
  body: string;
  etag: string;
};

const conditionalApiCaches = new WeakMap<ShellExecutor, Map<string, ConditionalApiCacheEntry>>();
const conditionalApiCacheLimit = 1_000;


export async function fetchConditionalApiJson<T>(
  executor: ShellExecutor,
  args: string[],
  force = false,
): Promise<T> {
  let cache = conditionalApiCaches.get(executor);

  if (!cache) {
    cache = new Map();
    conditionalApiCaches.set(executor, cache);
  }

  const account = await executor.getAccount?.() ?? "default";
  const key = JSON.stringify([account, args]);
  const cached = force ? undefined : cache.get(key);

  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
  }

  const result = await executor.execute("gh", [
    "api",
    "--include",
    ...(cached ? ["-H", `If-None-Match: ${cached.etag}`] : []),
    ...args,
  ]);
  const response = parseIncludedGhResponse(result.stdout);

  if (response?.status === 304) {
    if (!cached) {
      throw new Error("gh returned 304 Not Modified without a cached response.");
    }

    return parseJson<T>(cached.body);
  }

  assertSuccessfulGhResult(result);

  if (!response) {
    return parseJson<T>(result.stdout);
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GitHub returned HTTP ${response.status}.`);
  }

  if (response.etag) {
    if (!cache.has(key) && cache.size >= conditionalApiCacheLimit) {
      const oldestKey = cache.keys().next().value;

      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }

    cache.set(key, { body: response.body, etag: response.etag });
  } else {
    cache.delete(key);
  }

  return parseJson<T>(response.body);
}

function parseIncludedGhResponse(stdout: string): {
  body: string;
  etag?: string;
  status: number;
} | undefined {
  const statusMatch = stdout.match(/^HTTP\/\S+\s+(\d{3})\b/);

  if (!statusMatch) {
    return undefined;
  }

  const crlfEnd = stdout.indexOf("\r\n\r\n");
  const lfEnd = stdout.indexOf("\n\n");
  const headerEnd = crlfEnd >= 0 ? crlfEnd : lfEnd;

  if (headerEnd < 0) {
    throw new Error("gh returned HTTP headers without a response separator.");
  }

  const separatorLength = crlfEnd >= 0 ? 4 : 2;
  const headers = stdout.slice(0, headerEnd);
  const etag = headers.match(/^etag:\s*(.+)\r?$/im)?.[1]?.trim();

  return {
    body: stdout.slice(headerEnd + separatorLength),
    ...(etag ? { etag } : {}),
    status: Number(statusMatch[1]),
  };
}
