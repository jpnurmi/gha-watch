import { describe, expect, it } from "vitest";
import { getRepositoryUrl, getWatchActionsUrl } from "./watchLinks";

describe("watch links", () => {
  it("opens repositories from their slug", () => {
    expect(getRepositoryUrl({ owner: "getsentry", repo: "sentry" })).toBe(
      "https://github.com/getsentry/sentry",
    );
  });

  it("opens aggregate pull request status on the Checks page", () => {
    expect(
      getWatchActionsUrl("pull-request", "https://github.com/getsentry/sentry/pull/123/"),
    ).toBe("https://github.com/getsentry/sentry/pull/123/checks");
  });

  it.each(["workflow", "job"] as const)("opens %s status at its watched target", (subject) => {
    const url = subject === "workflow"
      ? "https://github.com/getsentry/sentry/actions/runs/123"
      : "https://github.com/getsentry/sentry/actions/runs/123/job/456";

    expect(getWatchActionsUrl(subject, url)).toBe(url);
  });
});
