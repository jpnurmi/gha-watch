import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getStatusIconSvg } from "./statusIcon";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const mixedTrayIcon = readFileSync(new URL("../../src-tauri/icons/tray-mixed.svg", import.meta.url), "utf8");

describe("getStatusIconSvg", () => {
  it.each(["success", "failure", "error", "cancelled", "skipped"] as const)(
    "uses a mask cutout for %s icons instead of hardcoded white marks",
    (tone) => {
      const svg = getStatusIconSvg(tone);

      expect(svg).toContain("<mask");
      expect(svg).toContain('mask="url(');
      expect(svg).not.toContain('stroke="#fff"');
    },
  );

  it("uses the standard spinner group for busy icons", () => {
    const svg = getStatusIconSvg("in-progress", "mixed");

    expect(svg).toContain('class="status-spinner"');
    expect(svg).not.toContain("status-failed-overlay");
  });

  it("uses the mixed status orange for in-progress checks with failed jobs", () => {
    const mixedStatusColor = styles.match(
      /\.watch-workflow-status\.status-icon-in-progress\.has-failed-children\s*\{[^}]*color:\s*(#[\da-f]+);/s,
    )?.[1];

    expect(mixedStatusColor).toBe("#e36209");
    expect(mixedTrayIcon).toContain(`fill="${mixedStatusColor}"`);
  });
});
