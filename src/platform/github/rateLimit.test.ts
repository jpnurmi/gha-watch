import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRateLimit } from "./account";
import { executeGraphql, getGraphqlRateLimit } from "./rateLimit";
import type { ShellExecutor } from "../shell";

const reset = 2_000_000_000;
const body = '{"errors":[{"message":"API rate limit exceeded"}]}';
function response(used = 5000, ending = "\n", resetAt = reset) {
  return [
    "HTTP/2.0 200 OK", "X-Ratelimit-Limit: 5000",
    `X-Ratelimit-Remaining: ${5000 - used}`, `X-Ratelimit-Used: ${used}`,
    `X-Ratelimit-Reset: ${resetAt}`, "", body,
  ].join(ending);
}

afterEach(() => vi.useRealTimers());

describe("GraphQL quota headers", () => {
  it.each(["\n", "\r\n"])("captures an exhausted quota on failure with %j line endings", async (ending) => {
    const execute = vi.fn(async () => ({ code: 1, stdout: response(5000, ending), stderr: "quota exceeded" }));
    const executor = { execute };
    await expect(executeGraphql(executor, ["api", "graphql", "-f", "query=existing query"])).resolves.toEqual({
      code: 1, stdout: body, stderr: "quota exceeded",
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith("gh", ["api", "graphql", "-f", "query=existing query", "--include"]);
    await expect(getGraphqlRateLimit(executor)).resolves.toEqual({
      resource: "GraphQL", limit: 5000, remaining: 0, used: 5000, reset,
    });
  });

  it("uses observed headers without another GraphQL request", async () => {
    const unused = { limit: 5000, used: 0, remaining: 5000, reset };
    const execute = vi.fn<ShellExecutor["execute"]>()
      .mockResolvedValueOnce({ code: 0, stdout: response(), stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ resources: { core: unused, graphql: unused } }), stderr: "" });
    const executor = { execute };
    await executeGraphql(executor, ["api", "graphql"]);
    await expect(fetchRateLimit(executor)).resolves.toEqual({
      resource: "GraphQL", limit: 5000, remaining: 0, used: 5000, reset,
    });
    expect(execute.mock.calls).toEqual([
      ["gh", ["api", "graphql", "--include"]],
      ["gh", ["api", "/rate_limit"]],
    ]);
  });

  it("expires observations at reset", async () => {
    vi.useFakeTimers();
    vi.setSystemTime((reset - 1) * 1000);
    const executor = { execute: async () => ({ code: 0, stdout: response(), stderr: "" }) };
    await executeGraphql(executor, ["api", "graphql"]);
    expect(await getGraphqlRateLimit(executor)).toBeDefined();
    vi.setSystemTime(reset * 1000);
    expect(await getGraphqlRateLimit(executor)).toBeUndefined();
  });

  it("does not reuse observations across accounts", async () => {
    let account = "first";
    const executor = {
      getAccount: async () => account,
      execute: async () => ({ code: 0, stdout: response(), stderr: "" }),
    };
    await executeGraphql(executor, ["api", "graphql"]);
    account = "second";
    expect(await getGraphqlRateLimit(executor)).toBeUndefined();
  });

  it("does not let out-of-order responses lower usage", async () => {
    const execute = vi.fn<ShellExecutor["execute"]>()
      .mockResolvedValueOnce({ code: 0, stdout: response(5000), stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: response(4999), stderr: "" });
    const executor = { execute };
    await executeGraphql(executor, ["api", "graphql"]);
    await executeGraphql(executor, ["api", "graphql"]);
    expect((await getGraphqlRateLimit(executor))?.used).toBe(5000);
  });

  it("ignores incomplete headers", async () => {
    const executor = { execute: async () => ({ code: 0, stdout: `HTTP/2.0 200 OK\n\n${body}`, stderr: "" }) };
    await expect(executeGraphql(executor, ["api", "graphql"])).resolves.toEqual({ code: 0, stdout: body, stderr: "" });
    expect(await getGraphqlRateLimit(executor)).toBeUndefined();
  });

  it.each([false, true])("keeps exhaustion across overlapping windows (healthy response first: %s)", async (healthyFirst) => {
    vi.useFakeTimers();
    vi.setSystemTime((reset - 1) * 1000);
    const exhausted = { code: 1, stdout: response(), stderr: "quota exceeded" };
    const healthy = { code: 0, stdout: response(568, "\n", reset + 120), stderr: "" };
    const execute = vi.fn<ShellExecutor["execute"]>()
      .mockResolvedValueOnce(healthyFirst ? healthy : exhausted)
      .mockResolvedValueOnce(healthyFirst ? exhausted : healthy)
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({ resources: {
          core: { limit: 5000, used: 3072, remaining: 1928, reset },
          graphql: { limit: 5000, used: 568, remaining: 4432, reset: reset + 120 },
        } }),
        stderr: "",
      });
    const executor = { execute };

    await executeGraphql(executor, ["api", "graphql"]);
    await executeGraphql(executor, ["api", "graphql"]);

    await expect(fetchRateLimit(executor)).resolves.toEqual({
      resource: "GraphQL", limit: 5000, remaining: 0, used: 5000, reset,
    });
  });

  it("accepts a healthy quota after exhaustion resets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime((reset - 1) * 1000);
    const execute = vi.fn<ShellExecutor["execute"]>()
      .mockResolvedValueOnce({ code: 1, stdout: response(), stderr: "quota exceeded" })
      .mockResolvedValueOnce({ code: 0, stdout: response(1, "\n", reset + 3600), stderr: "" });
    const executor = { execute };

    await executeGraphql(executor, ["api", "graphql"]);
    vi.setSystemTime(reset * 1000);
    await executeGraphql(executor, ["api", "graphql"]);

    await expect(getGraphqlRateLimit(executor)).resolves.toEqual({
      resource: "GraphQL", limit: 5000, remaining: 4999, used: 1, reset: reset + 3600,
    });
  });

  it("ignores responses from an expired window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(reset * 1000);
    const execute = vi.fn<ShellExecutor["execute"]>()
      .mockResolvedValueOnce({ code: 0, stdout: response(1, "\n", reset + 3600), stderr: "" })
      .mockResolvedValueOnce({ code: 1, stdout: response(), stderr: "quota exceeded" });
    const executor = { execute };

    await executeGraphql(executor, ["api", "graphql"]);
    await executeGraphql(executor, ["api", "graphql"]);

    expect((await getGraphqlRateLimit(executor))?.remaining).toBe(4999);
  });
});
