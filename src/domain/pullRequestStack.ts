export type PullRequestStack = {
  position: number;
  size: number;
  number?: number;
};

export function decodePullRequestStack(value: unknown): PullRequestStack | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { position, size, number } = value as Record<string, unknown>;
  if (typeof position !== "number" || typeof size !== "number" ||
    !Number.isSafeInteger(position) || !Number.isSafeInteger(size) ||
    position < 1 || size < position) return undefined;
  return {
    position,
    size,
    ...(typeof number === "number" && Number.isSafeInteger(number) && number > 0 ? { number } : {}),
  };
}
