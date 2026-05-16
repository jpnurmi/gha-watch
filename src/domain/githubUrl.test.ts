import { describe, expect, it } from "vitest";
import { parseGitHubActionsUrl } from "./githubUrl";

describe("parseGitHubActionsUrl", () => {
  it("parses workflow run URLs", () => {
    expect(
      parseGitHubActionsUrl("https://github.com/getsentry/sentry/actions/runs/1234567890"),
    ).toEqual({
      kind: "run",
      owner: "getsentry",
      repo: "sentry",
      runId: "1234567890",
      url: "https://github.com/getsentry/sentry/actions/runs/1234567890",
    });
  });

  it("preserves pull request references from workflow run URLs", () => {
    expect(
      parseGitHubActionsUrl("https://github.com/getsentry/sentry/actions/runs/1234567890?pr=51"),
    ).toEqual({
      kind: "run",
      owner: "getsentry",
      repo: "sentry",
      runId: "1234567890",
      prNumber: "51",
      url: "https://github.com/getsentry/sentry/actions/runs/1234567890?pr=51",
    });
  });

  it("parses markdown links containing workflow run URLs", () => {
    expect(
      parseGitHubActionsUrl(
        "[getsentry/sentry](https://github.com/getsentry/sentry/actions/runs/1234567890)",
      ),
    ).toEqual({
      kind: "run",
      owner: "getsentry",
      repo: "sentry",
      runId: "1234567890",
      url: "https://github.com/getsentry/sentry/actions/runs/1234567890",
    });
  });

  it("parses job URLs with an explicit job segment", () => {
    expect(
      parseGitHubActionsUrl(
        "https://github.com/getsentry/sentry/actions/runs/1234567890/job/9876543210",
      ),
    ).toEqual({
      kind: "job",
      owner: "getsentry",
      repo: "sentry",
      runId: "1234567890",
      jobId: "9876543210",
      url: "https://github.com/getsentry/sentry/actions/runs/1234567890/job/9876543210",
    });
  });

  it("parses GitHub job URLs that use the runs path for the job id", () => {
    expect(parseGitHubActionsUrl("https://github.com/getsentry/sentry/runs/9876543210")).toEqual({
      kind: "job",
      owner: "getsentry",
      repo: "sentry",
      jobId: "9876543210",
      url: "https://github.com/getsentry/sentry/runs/9876543210",
    });
  });

  it("parses pull request URLs for live PR watches", () => {
    expect(parseGitHubActionsUrl("https://github.com/getsentry/sentry/pull/51")).toEqual({
      kind: "pr",
      owner: "getsentry",
      repo: "sentry",
      prNumber: "51",
      url: "https://github.com/getsentry/sentry/pull/51",
    });
  });

  it("rejects unsupported URLs", () => {
    expect(() => parseGitHubActionsUrl("https://example.com/getsentry/sentry/actions/runs/1"))
      .toThrow("Paste a GitHub Actions run, job, or pull request URL.");
  });
});
