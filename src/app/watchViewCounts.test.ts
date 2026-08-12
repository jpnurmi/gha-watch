import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RunWatchTarget } from "../domain/githubUrl";
import {
  addWatch,
  clearDoneWatches,
  clearExpiredDoneWatches,
  setWatchesTriageState,
  type WatchRecord,
} from "../domain/watches";
import {
  formatWatchViewCount,
  getWatchViewAriaLabel,
  getWatchViewCounts,
} from "./watchViewCounts";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function runTarget(runId: string): RunWatchTarget {
  return {
    kind: "run",
    owner: "jpnurmi",
    repo: "gha-watch",
    runId,
    url: `https://github.com/jpnurmi/gha-watch/actions/runs/${runId}`,
  };
}

function watch(overrides: Partial<WatchRecord> = {}): WatchRecord {
  return {
    id: "jpnurmi/gha-watch/run/1",
    target: runTarget("1"),
    label: "CI",
    status: "in_progress",
    lastSeenStatus: "queued",
    lastState: { status: "in_progress", conclusion: null },
    active: true,
    error: undefined,
    ...overrides,
  };
}

describe("getWatchViewCounts", () => {
  it("counts every leaf watch in its effective triage state", () => {
    const watches = [
      watch(),
      watch({
        id: "jpnurmi/gha-watch/run/2",
        target: runTarget("2"),
        status: "queued",
        lastSeenStatus: "queued",
      }),
      watch({
        id: "jpnurmi/gha-watch/run/3",
        target: runTarget("3"),
        triageState: "saved",
      }),
      watch({
        id: "jpnurmi/gha-watch/run/4",
        target: runTarget("4"),
        triageState: "done",
      }),
    ];

    expect(getWatchViewCounts(watches)).toEqual({
      inbox: { total: 2, unseen: 1 },
      saved: { total: 1, unseen: 1 },
      done: { total: 1, unseen: 1 },
    });
  });

  it("counts added watches without counting a repository parent", () => {
    const watches = addWatch([], runTarget("1"));
    const withSibling = addWatch(watches, runTarget("2"));

    expect(getWatchViewCounts(withSibling)).toEqual({
      inbox: { total: 2, unseen: 0 },
      saved: { total: 0, unseen: 0 },
      done: { total: 0, unseen: 0 },
    });
  });

  it("carries unseen state through Save and acknowledges intentional Done actions", () => {
    const unseen = [watch()];
    const saved = setWatchesTriageState(unseen, [unseen[0].id], "saved");

    expect(getWatchViewCounts(saved).saved).toEqual({ total: 1, unseen: 1 });

    const done = setWatchesTriageState(saved, [saved[0].id], "done");
    expect(getWatchViewCounts(done).done).toEqual({ total: 1, unseen: 0 });

    const restored = setWatchesTriageState(done, [done[0].id], "inbox");
    expect(getWatchViewCounts(restored).inbox).toEqual({ total: 1, unseen: 0 });
  });

  it("updates after Done clearing and retention pruning", () => {
    const watches = [
      watch({
        id: "recent",
        triageState: "done",
        doneAt: "2026-07-15T00:00:00.000Z",
      }),
      watch({
        id: "expired",
        triageState: "done",
        doneAt: "2026-07-01T00:00:00.000Z",
      }),
    ];
    const retained = clearExpiredDoneWatches(watches, new Date("2026-08-02T00:00:00Z"));

    expect(getWatchViewCounts(retained).done.total).toBe(1);
    expect(getWatchViewCounts(clearDoneWatches(retained, ["recent"])).done.total).toBe(0);
  });
});

describe("watch view badges", () => {
  it("caps only the visual count and keeps exact accessible totals", () => {
    expect(formatWatchViewCount(99)).toBe("99");
    expect(formatWatchViewCount(100)).toBe("99+");
    expect(
      getWatchViewAriaLabel("inbox", { total: 123, unseen: 17 }),
    ).toBe("Inbox, 123 items, 17 unseen");
    expect(getWatchViewAriaLabel("saved", { total: 1, unseen: 1 })).toBe(
      "Saved, 1 item",
    );
  });

  it("derives tab totals from the complete controller state before view filtering", () => {
    expect(mainSource).toContain("const watchViewCounts = getWatchViewCounts(allWatches);");
    expect(mainSource).toContain("const watches = allWatches.filter");
    expect(mainSource).toContain("renderWatchViewSwitcher(watchViewCounts)");
  });

  it("renders quiet zero states and exact accessible labels from trusted values", () => {
    expect(mainSource).toContain('aria-label="${getWatchViewAriaLabel(state, count)}"');
    expect(mainSource).toContain("count.total > 0");
    expect(mainSource).toContain("formatWatchViewCount(count.total)");
    expect(mainSource).toContain('state === "inbox" && count.unseen > 0');
    expect(styles).toMatch(/\.watch-view-button\s*\{[^}]*position:\s*relative;[^}]*width:\s*75px;[^}]*place-items:\s*center;/s);
    expect(styles).toMatch(/\.watch-view-count\s*\{[^}]*position:\s*absolute;[^}]*top:\s*3px;[^}]*right:\s*5px;[^}]*font-variant-numeric:\s*tabular-nums;/s);
    expect(styles).not.toMatch(/\.watch-view-count\s*\{[^}]*(?:background|border|box-shadow):/s);
    expect(styles).toMatch(/\.watch-view-button\.has-unseen-items \.watch-view-count\s*\{[^}]*color:\s*rgb\(121 192 255 \/ 58%\);/s);
  });
});
