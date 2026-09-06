import { describe, expect, it } from "vitest";
import { getWatchId, addWatch } from "./watches";
import { decodeWatchRecords } from "./watchRecords";
import { normalizeWatchSuppressions, isWatchSuppressed } from "./watchSuppressions";
import { normalizeAppSettings } from "./settings";
import { createPopupViewModel } from "../app/viewModel";

const target = { kind: "run" as const, owner: "GetSentry", repo: "Sentry", runId: "123",
  url: "https://github.com/GetSentry/Sentry/actions/runs/123" };

describe("canonical identities", () => {
  it("migrates watch IDs and suppressions together while retaining display casing", () => {
    const [watch] = addWatch([], target);
    const [decoded] = decodeWatchRecords([{ ...watch, id: "GetSentry/Sentry/run/123",
      ignoredTargetIds: ["GetSentry/Sentry/job/456"] }]);
    expect(getWatchId(target)).toBe("getsentry/sentry/run/123");
    expect(decoded.target.owner).toBe("GetSentry");
    expect(decoded.ignoredTargetIds).toEqual(["getsentry/sentry/job/456"]);
    expect(isWatchSuppressed(normalizeWatchSuppressions([
      { id: "GetSentry/Sentry/run/123", clearedAt: "2026-09-06T00:00:00Z" },
    ]), decoded.id)).toBe(true);
  });

  it("combines subscriptions and grouping across repository casing", () => {
    const settings = normalizeAppSettings({ watchedRepos: [
      { owner: "GetSentry", repo: "Sentry", pullRequestScope: "user" },
      { owner: "getsentry", repo: "sentry", workflowTargets: [{ kind: "default", workflowNames: ["CI"] }] },
    ], repoOrder: ["GetSentry/Sentry", "getsentry/sentry"] });
    expect(settings.repoOrder).toEqual(["getsentry/sentry"]);
    expect(settings.watchedRepos).toHaveLength(1);
    expect(settings.watchedRepos[0]).toMatchObject({ pullRequestScope: "user", workflowTargets: [{ kind: "default", workflowNames: ["CI"] }] });
    const watches = addWatch([], { ...target, owner: "getsentry", repo: "sentry" });
    expect(createPopupViewModel(watches, new Date(), settings.watchedRepos).groups).toHaveLength(1);
  });
});
