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

export type RepoTarget = {
  kind: "repo";
  owner: string;
  repo: string;
  url: string;
};

export type CheckWatchTarget = RunWatchTarget | JobWatchTarget;
export type ParsedWatchTarget = CheckWatchTarget | PrWatchTarget;
export type ParsedGitHubTarget = ParsedWatchTarget | RepoTarget;

export type ParseGitHubActionsUrlOptions = {
  defaultOwner?: string;
};

const unsupportedUrlMessage = "Paste a GitHub repository, Actions run, job, pull request URL, or PR slug.";
const ownerPattern = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
const ownerPatternExact = new RegExp(`^${ownerPattern}$`);
const repoPattern = "[A-Za-z0-9._-]+";
const repoPatternExact = new RegExp(`^${repoPattern}$`);
const pullRequestSlugPattern = new RegExp(`^(?:(${ownerPattern})/)?(${repoPattern})#([1-9]\\d*)$`);
const repositorySlugPattern = new RegExp(`^(?:(${ownerPattern})/)?(${repoPattern})$`);

export function parseGitHubActionsUrl(
  input: string,
  options: ParseGitHubActionsUrlOptions = {},
): ParsedGitHubTarget {
  const reference = extractWatchReference(input);
  const pullRequestSlugTarget = parsePullRequestSlugTarget(reference, options.defaultOwner);

  if (pullRequestSlugTarget) {
    return pullRequestSlugTarget;
  }

  const repositorySlugTarget = parseRepositorySlugTarget(reference, options.defaultOwner);

  if (repositorySlugTarget) {
    return repositorySlugTarget;
  }

  let parsed: URL;

  try {
    parsed = new URL(reference);
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

  if (owner && repo && !section && ownerPatternExact.test(owner) && repoPatternExact.test(repo)) {
    return {
      kind: "repo",
      owner,
      repo,
      url: `${parsed.origin}/${owner}/${repo}`,
    };
  }

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

export function isOwnerlessPullRequestSlug(input: string): boolean {
  const slug = parsePullRequestSlug(extractWatchReference(input));
  return Boolean(slug && !slug.owner);
}

export function isOwnerlessRepositorySlug(input: string): boolean {
  const slug = parseRepositorySlug(extractWatchReference(input));
  return Boolean(slug && !slug.owner);
}

type PullRequestSlug = {
  owner?: string;
  repo: string;
  prNumber: string;
};

type RepositorySlug = {
  owner?: string;
  repo: string;
};

function parsePullRequestSlugTarget(
  reference: string,
  defaultOwner: string | undefined,
): PrWatchTarget | undefined {
  const slug = parsePullRequestSlug(reference);

  if (!slug) {
    return undefined;
  }

  const owner = slug.owner || getDefaultOwner(defaultOwner);

  if (!owner) {
    return undefined;
  }

  return {
    kind: "pr",
    owner,
    repo: slug.repo,
    prNumber: slug.prNumber,
    url: `https://github.com/${owner}/${slug.repo}/pull/${slug.prNumber}`,
  };
}

function parsePullRequestSlug(reference: string): PullRequestSlug | undefined {
  const match = reference.match(pullRequestSlugPattern);

  if (!match) {
    return undefined;
  }

  return {
    ...(match[1] ? { owner: match[1] } : {}),
    repo: match[2],
    prNumber: match[3],
  };
}

function parseRepositorySlugTarget(reference: string, defaultOwner: string | undefined): RepoTarget | undefined {
  const slug = parseRepositorySlug(reference);

  if (!slug) {
    return undefined;
  }

  const owner = slug.owner || getDefaultOwner(defaultOwner);

  if (!owner) {
    return undefined;
  }

  return {
    kind: "repo",
    owner,
    repo: slug.repo,
    url: `https://github.com/${owner}/${slug.repo}`,
  };
}

function parseRepositorySlug(reference: string): RepositorySlug | undefined {
  const match = reference.match(repositorySlugPattern);

  if (!match) {
    return undefined;
  }

  return {
    ...(match[1] ? { owner: match[1] } : {}),
    repo: match[2],
  };
}

function getDefaultOwner(defaultOwner: string | undefined): string | undefined {
  const owner = defaultOwner?.trim();
  return owner && ownerPatternExact.test(owner) ? owner : undefined;
}

function getPullRequestNumber(searchParams: URLSearchParams): string | undefined {
  const value = searchParams.get("pr")?.trim();
  return value && isPositiveInteger(value) ? value : undefined;
}

function isPositiveInteger(value: string | undefined): value is string {
  return Boolean(value && /^[1-9]\d*$/.test(value));
}

function extractWatchReference(input: string): string {
  const trimmed = input.trim();
  const markdownLink = trimmed.match(/\]\((https:\/\/github\.com\/[^)\s]+)\)/);
  if (markdownLink) {
    return markdownLink[1];
  }

  const bareUrl = trimmed.match(/https:\/\/github\.com\/\S+/);
  return trimTrailingPunctuation(bareUrl ? bareUrl[0] : trimmed);
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[),.;]+$/, "");
}
