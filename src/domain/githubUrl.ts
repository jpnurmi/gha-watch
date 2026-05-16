export type RunWatchTarget = {
  kind: "run";
  owner: string;
  repo: string;
  runId: string;
  prNumber?: string;
  url: string;
};

export type JobWatchTarget = {
  kind: "job";
  owner: string;
  repo: string;
  jobId: string;
  runId?: string;
  prNumber?: string;
  url: string;
};

export type PrWatchTarget = {
  kind: "pr";
  owner: string;
  repo: string;
  prNumber: string;
  url: string;
};

export type CheckWatchTarget = RunWatchTarget | JobWatchTarget;
export type ParsedWatchTarget = CheckWatchTarget | PrWatchTarget;

const unsupportedUrlMessage = "Paste a GitHub Actions run, job, or pull request URL.";

export function parseGitHubActionsUrl(input: string): ParsedWatchTarget {
  let parsed: URL;

  try {
    parsed = new URL(extractGitHubUrl(input));
  } catch {
    throw new Error(unsupportedUrlMessage);
  }

  if (parsed.hostname !== "github.com") {
    throw new Error(unsupportedUrlMessage);
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  const [owner, repo, section, subSection, runId, jobSection, jobId] = parts;
  const prNumber = getPullRequestNumber(parsed.searchParams);
  const canonicalUrl = `${parsed.origin}${parsed.pathname}${prNumber ? `?pr=${prNumber}` : ""}`;

  if (owner && repo && section === "pull" && isPositiveInteger(subSection)) {
    return {
      kind: "pr",
      owner,
      repo,
      prNumber: subSection,
      url: `${parsed.origin}/${owner}/${repo}/pull/${subSection}`,
    };
  }

  if (owner && repo && section === "actions" && subSection === "runs" && runId) {
    if (jobSection === "job" && jobId) {
      return {
        kind: "job",
        owner,
        repo,
        runId,
        jobId,
        ...(prNumber ? { prNumber } : {}),
        url: canonicalUrl,
      };
    }

    if (!jobSection) {
      return {
        kind: "run",
        owner,
        repo,
        runId,
        ...(prNumber ? { prNumber } : {}),
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
      ...(prNumber ? { prNumber } : {}),
      url: canonicalUrl,
    };
  }

  throw new Error(unsupportedUrlMessage);
}

function getPullRequestNumber(searchParams: URLSearchParams): string | undefined {
  const value = searchParams.get("pr")?.trim();
  return value && isPositiveInteger(value) ? value : undefined;
}

function isPositiveInteger(value: string | undefined): value is string {
  return Boolean(value && /^[1-9]\d*$/.test(value));
}

function extractGitHubUrl(input: string): string {
  const trimmed = input.trim();
  const markdownLink = trimmed.match(/\]\((https:\/\/github\.com\/[^)\s]+)\)/);
  if (markdownLink) {
    return markdownLink[1];
  }

  const bareUrl = trimmed.match(/https:\/\/github\.com\/\S+/);
  return bareUrl ? bareUrl[0].replace(/[),.;]+$/, "") : trimmed;
}
