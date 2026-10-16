import { describe, expect, it, vi } from "vitest";
import { createScreenshotWatches, screenshotNow } from "./screenshot";
import { createWatchController } from "./watchController";
import { getWatchViewCounts } from "./watchViewCounts";

describe("screenshots", () => {
  it("retains all three views with the fixture clock", () => {
    const controller = createWatchController({
      now: () => screenshotNow,
      fetchState: vi.fn(),
      notify: vi.fn(),
      save: vi.fn(async () => {}),
      saveSuppressions: vi.fn(async () => {}),
    }, createScreenshotWatches());

    const counts = getWatchViewCounts(controller.getWatches());
    expect(counts.inbox.total).toBe(4);
    expect(counts.saved.total).toBe(1);
    expect(counts.done.total).toBe(1);
    expect(counts.inbox.unseen).toBeGreaterThan(0);
  });

  it("uses only the example repositories", () => {
    const watches = createScreenshotWatches();
    expect(new Set(watches.map(({ target }) => `${target.owner}/${target.repo}`)))
      .toEqual(new Set(["jpnurmi/gha-watch", "jpnurmi/cuotax"]));
    expect(JSON.stringify(watches)).not.toMatch(/getsentry/i);
  });
});
