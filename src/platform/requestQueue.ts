export function createRequestQueue(limit = 4) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid request limit.");
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(operation: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      active++;
    }
    try {
      return await operation();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
