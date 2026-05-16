export type RunWatchTarget = {
  kind: "run";
  owner: string;
  repo: string;
  runId: string;
  url: string;
};

export type JobWatchTarget = {
  kind: "job";
  owner: string;
  repo: string;
  jobId: string;
  runId?: string;
  url: string;
};

export type ParsedWatchTarget = RunWatchTarget | JobWatchTarget;

const unsupportedUrlMessage = "Paste a GitHub Actions run or job URL.";

export function parseGitHubActionsUrl(input: string): ParsedWatchTarget {
  let parsed: URL;

  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error(unsupportedUrlMessage);
  }

  if (parsed.hostname !== "github.com") {
    throw new Error(unsupportedUrlMessage);
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  const [owner, repo, section, subSection, runId, jobSection, jobId] = parts;
  const canonicalUrl = `${parsed.origin}${parsed.pathname}`;

  if (owner && repo && section === "actions" && subSection === "runs" && runId) {
    if (jobSection === "job" && jobId) {
      return {
        kind: "job",
        owner,
        repo,
        runId,
        jobId,
        url: canonicalUrl,
      };
    }

    if (!jobSection) {
      return {
        kind: "run",
        owner,
        repo,
        runId,
        url: canonicalUrl,
      };
    }
  }

  if (owner && repo && section === "runs" && subSection) {
    return {
      kind: "job",
      owner,
      repo,
      jobId: subSection,
      url: canonicalUrl,
    };
  }

  throw new Error(unsupportedUrlMessage);
}
