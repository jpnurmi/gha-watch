export type RefreshHealth = {
  status: "successful" | "degraded" | "failed";
  hasSuccessfulRequest: boolean;
};

export type RefreshHealthInput = {
  successfulItems: number;
  failedItems: number;
  rateLimitSucceeded?: boolean;
};

export function getRefreshHealth(input: RefreshHealthInput): RefreshHealth {
  const successfulItems = input.successfulItems + (input.rateLimitSucceeded === true ? 1 : 0);
  const failedItems = input.failedItems + (input.rateLimitSucceeded === false ? 1 : 0);

  return {
    status: failedItems === 0
      ? "successful"
      : successfulItems > 0
        ? "degraded"
        : "failed",
    hasSuccessfulRequest: successfulItems > 0,
  };
}
