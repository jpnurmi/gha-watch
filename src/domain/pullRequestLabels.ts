export type PullRequestLabel = {
  name: string;
  color: string;
  description?: string;
};

export function decodePullRequestLabels(value: unknown): PullRequestLabel[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((label) => {
    if (!label || typeof label.name !== "string" || !label.name.trim() ||
      typeof label.color !== "string" || !/^[0-9a-f]{6}$/i.test(label.color)) {
      return [];
    }

    return [{
      name: label.name,
      color: label.color.toLowerCase(),
      ...(typeof label.description === "string" && label.description.trim()
        ? { description: label.description } : {}),
    }];
  });
}
