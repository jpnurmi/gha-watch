import { describe, expect, it } from "vitest";
import { getRefreshHealth } from "./refreshHealth";

describe("getRefreshHealth", () => {
  it("counts a successful rate-limit lookup independently from repository failures", () => {
    expect(
      getRefreshHealth({
        successfulItems: 0,
        failedItems: 1,
        rateLimitSucceeded: true,
      }),
    ).toEqual({
      status: "degraded",
      hasSuccessfulRequest: true,
    });
  });

  it("reports total failure when every attempted request fails", () => {
    expect(
      getRefreshHealth({
        successfulItems: 0,
        failedItems: 1,
        rateLimitSucceeded: false,
      }),
    ).toEqual({
      status: "failed",
      hasSuccessfulRequest: false,
    });
  });

  it("includes a failed rate-limit lookup in an otherwise successful refresh", () => {
    expect(
      getRefreshHealth({
        successfulItems: 1,
        failedItems: 0,
        rateLimitSucceeded: false,
      }),
    ).toEqual({
      status: "degraded",
      hasSuccessfulRequest: true,
    });
  });
});
