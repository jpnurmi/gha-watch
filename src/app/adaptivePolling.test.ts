import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  activePollIntervalMs,
  getAdaptivePollIntervalMs,
  terminalPollIntervalMs,
} from "./adaptivePolling";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

describe("getAdaptivePollIntervalMs", () => {
  it("polls active watches every 30 seconds", () => {
    expect(getAdaptivePollIntervalMs(true)).toBe(activePollIntervalMs);
    expect(activePollIntervalMs).toBe(30_000);
  });

  it("backs off to five minutes when all watches are terminal", () => {
    expect(getAdaptivePollIntervalMs(false)).toBe(terminalPollIntervalMs);
    expect(terminalPollIntervalMs).toBe(5 * 60_000);
  });

  it("schedules the next poll from the current Inbox activity", () => {
    expect(mainSource).toContain('getWatchTriageState(watch) === "inbox" && watch.active');
    expect(mainSource).toContain("scheduleNextPoll();");
    expect(mainSource).toContain("window.setTimeout(() => {");
    expect(mainSource).not.toContain("window.setInterval(() => {");
  });

  it("polls immediately when the window gains focus", () => {
    expect(mainSource).toMatch(
      /onFocusChanged[\s\S]*?if \(focused\) \{[\s\S]*?void poll\(\);/,
    );
  });
});
