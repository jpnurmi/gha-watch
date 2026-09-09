import { assertSuccessfulGhResult, normalizeGhError, parseJson, requiredString } from "../ghProtocol";
import { createTauriShellExecutor, type ShellExecutor } from "../shell";
import { type RateLimit, type RateLimitResponse, type RateLimitValues, type UserViewResponse } from "./responses";

export async function fetchAuthenticatedUserLogin(
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<string> {
  try {
    const result = await executor.execute("gh", ["api", "user"]);

    assertSuccessfulGhResult(result);
    return requiredString(parseJson<UserViewResponse>(result.stdout).login, "authenticated user login");
  } catch (error) {
    throw normalizeGhError(error);
  }
}

function getRemainingRateLimitRatio(rateLimit: RateLimitValues): number {
  return rateLimit.limit > 0 ? rateLimit.remaining / rateLimit.limit : 0;
}

export async function fetchRateLimit(
  executor: ShellExecutor = createTauriShellExecutor(),
): Promise<RateLimit> {
  try {
    const result = await executor.execute("gh", ["api", "/rate_limit"]);

    assertSuccessfulGhResult(result);
    const response = parseJson<RateLimitResponse>(result.stdout);
    const core: RateLimit = { resource: "REST", ...requiredRateLimit(response?.resources?.core, "REST rate limit") };
    const graphql: RateLimit = { resource: "GraphQL", ...requiredRateLimit(response?.resources?.graphql, "GraphQL rate limit") };

    return getRemainingRateLimitRatio(graphql) < getRemainingRateLimitRatio(core)
      ? graphql
      : core;
  } catch (error) {
    throw normalizeGhError(error);
  }
}

function requiredRateLimit(value: unknown, label: string): RateLimitValues {
  if (
    !value || typeof value !== "object" ||
    !("limit" in value) || typeof value.limit !== "number" ||
    !("used" in value) || typeof value.used !== "number" ||
    !("remaining" in value) || typeof value.remaining !== "number" ||
    !("reset" in value) || typeof value.reset !== "number"
  ) {
    throw new Error(`gh returned a response without valid ${label}.`);
  }

  return { limit: value.limit, used: value.used, remaining: value.remaining, reset: value.reset };
}
