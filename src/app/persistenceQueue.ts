export function createPersistenceQueue<T>(save: (value: T) => Promise<void>): {
  write(value: T): void;
  flush(): Promise<void>;
} {
  let pending: Promise<void> | undefined;
  let latest = Promise.resolve();
  let revision = 0;
  let retry: (() => void) | undefined;

  async function persist(value: T): Promise<void> {
    await save(value);
  }

  function write(value: T): void {
    const current = ++revision;
    const result = pending
      ? pending.then(() => current === revision ? persist(value) : undefined)
      : persist(value);
    latest = result;
    retry = undefined;
    pending = result.then(
      () => {
        if (latest === result) {
          pending = undefined;
        }
      },
      () => {
        if (latest === result) {
          pending = undefined;
          retry = () => write(value);
        }
      },
    );
  }

  return {
    write,
    async flush() {
      retry?.();
      let result: Promise<void>;
      do {
        result = latest;
        await result;
      } while (result !== latest);
    },
  };
}
