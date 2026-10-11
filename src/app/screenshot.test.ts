import { describe, expect, it, vi } from "vitest";
import { captureScreenshot, createScreenshotWatches, screenshotNow } from "./screenshot";
import { createWatchController } from "./watchController";
import { getWatchViewCounts } from "./watchViewCounts";
import { invokeDesktop } from "../platform/desktop";

vi.mock("../platform/desktop", () => ({ invokeDesktop: vi.fn(async () => {}) }));

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

  it("waits for fonts and painted frames before capturing", async () => {
    let fontsReady!: () => void;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("document", { fonts: { ready: new Promise<void>((resolve) => { fontsReady = resolve; }) } });
    vi.stubGlobal("window", { requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback) });
    vi.mocked(invokeDesktop).mockClear();

    try {
      const tray = { status: "mixed" as const, tooltip: "GHA Watch", hasUnseenChanges: true };
      const capture = captureScreenshot(tray);
      expect(frames).toHaveLength(0);
      expect(invokeDesktop).not.toHaveBeenCalled();
      fontsReady();
      await Promise.resolve();
      frames.shift()!(0);
      expect(invokeDesktop).not.toHaveBeenCalled();
      frames.shift()!(0);
      await capture;
      expect(invokeDesktop).toHaveBeenCalledWith("screenshot_ready", tray);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
