export function getRepositoryKey(repo: { owner: string; repo: string }): string {
  return `${repo.owner}/${repo.repo}`.toLowerCase();
}

export function canonicalWatchId(id: string): string {
  const [owner, repo, kind, number, extra] = id.split("/");
  return owner && repo && ["pull", "run", "job"].includes(kind) && number && extra === undefined
    ? `${getRepositoryKey({ owner, repo })}/${kind}/${number}`
    : id;
}
