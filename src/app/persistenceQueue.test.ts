import { describe, expect, it } from "vitest";
import { createPersistenceQueue } from "./persistenceQueue";

describe("persistence queue", () => {
  it("prevents an older write from finishing after a newer snapshot", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const saved: number[] = [];
    const queue = createPersistenceQueue(async (value: number) => {
      if (value === 1) {
        await blocked;
      }
      saved.push(value);
    });

    queue.write(1);
    await Promise.resolve();
    queue.write(2);
    expect(saved).toEqual([]);
    release();
    await queue.flush();
    expect(saved).toEqual([1, 2]);
  });

  it("recovers from a rejected write with the latest full snapshot", async () => {
    const saved: number[] = [];
    const queue = createPersistenceQueue(async (value: number) => {
      if (value === 1) {
        throw new Error("failed");
      }
      saved.push(value);
    });

    queue.write(1);
    await Promise.resolve();
    queue.write(2);
    await queue.flush();
    expect(saved).toEqual([2]);
  });

  it("reports a synchronous storage failure and retries it on a later flush", async () => {
    let fail = true;
    const queue = createPersistenceQueue(() => {
      if (fail) {
        throw new Error("quota exceeded");
      }
      return Promise.resolve();
    });

    queue.write("latest");
    await expect(queue.flush()).rejects.toThrow("quota exceeded");
    fail = false;
    await expect(queue.flush()).resolves.toBeUndefined();
  });

  it("coalesces superseded snapshots before writing", async () => {
    const saved: number[] = [];
    const queue = createPersistenceQueue(async (value: number) => { saved.push(value); });
    queue.write(1);
    queue.write(2);
    queue.write(3);
    await queue.flush();
    expect(saved).toEqual([1, 3]);
  });

});
