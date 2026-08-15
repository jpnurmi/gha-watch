import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getFreshnessState } from "./freshness";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("getFreshnessState", () => {
  it("shows the initial refresh without calling it stale", () => {
    expect(
      getFreshnessState({
        isRefreshing: true,
        lastRefreshFailed: false,
        now: 10_000,
        staleAfterMs: 60_000,
      }),
    ).toEqual({ label: "Updating\u2026", stale: false });
  });

  it("formats recent successful updates", () => {
    expect(
      getFreshnessState({
        isRefreshing: false,
        lastRefreshFailed: false,
        lastUpdatedAt: 10_000,
        now: 42_000,
        staleAfterMs: 60_000,
      }),
    ).toEqual({ label: "32s ago", stale: false });
  });

  it("marks overdue updates as stale", () => {
    expect(
      getFreshnessState({
        isRefreshing: false,
        lastRefreshFailed: false,
        lastUpdatedAt: 10_000,
        now: 70_000,
        staleAfterMs: 60_000,
      }),
    ).toEqual({ label: "1m ago", stale: true });
  });

  it("marks a failed refresh as stale immediately", () => {
    expect(
      getFreshnessState({
        isRefreshing: false,
        lastRefreshFailed: true,
        lastUpdatedAt: 65_000,
        now: 70_000,
        staleAfterMs: 60_000,
      }),
    ).toEqual({ label: "0s ago", stale: true });
  });

  it("wires a subtle manual refresh control into the header", () => {
    expect(mainSource).toContain('data-action="refresh"');
    expect(mainSource).toContain("void poll();");
    expect(mainSource).toContain('class="header-brand"');
    expect(mainSource).toContain("renderFreshnessIndicator()");
    expect(mainSource).toContain('class="header-freshness"');
    expect(mainSource).toContain("if (refreshHealth.hasSuccessfulRequest)");
    expect(mainSource).toMatch(/class="header-freshness">[\s\S]*?data-action="refresh"[\s\S]*?renderFreshnessIndicator\(\)/);
    expect(styles).toMatch(/\.header-freshness\s*\{[^}]*position:\s*absolute;[^}]*top:\s*calc\(100% \+ 1px\);/s);
    expect(styles).toMatch(/\.header-freshness\s*\{[^}]*align-items:\s*center;/s);
    expect(styles).toMatch(
      /\.refresh-button\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*color:\s*rgb\(238 241 245 \/ 46%\);/s,
    );
    expect(styles).toMatch(/\.refresh-button svg\s*\{[^}]*width:\s*12px;[^}]*height:\s*12px;/s);
    expect(styles).toMatch(/\.rate-limit-indicator\s*\{[^}]*right:\s*0;[^}]*bottom:\s*-12px;/s);
    expect(styles).toMatch(/\.freshness-indicator\.is-stale\s*\{[^}]*color:\s*#d29922;/s);
  });
});
