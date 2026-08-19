import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getStatusIconSvg } from "./statusIcon";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const activeTrayIcon = readFileSync(new URL("../../src-tauri/icons/tray-active.svg", import.meta.url), "utf8");
const mixedTrayIcon = readFileSync(new URL("../../src-tauri/icons/tray-mixed.svg", import.meta.url), "utf8");
const mixedUnseenTrayIcon = readFileSync(
  new URL("../../src-tauri/icons/tray-mixed-unseen.svg", import.meta.url),
  "utf8",
);
const activeUnseenTrayIcon = readFileSync(
  new URL("../../src-tauri/icons/tray-active-unseen.svg", import.meta.url),
  "utf8",
);
const errorTrayIcon = readFileSync(new URL("../../src-tauri/icons/tray-error.svg", import.meta.url), "utf8");
const errorUnseenTrayIcon = readFileSync(
  new URL("../../src-tauri/icons/tray-error-unseen.svg", import.meta.url),
  "utf8",
);

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

  it("uses failure red for in-progress checks with failed jobs", () => {
    const mixedStatusColor = styles.match(
      /\.watch-workflow-status\.status-icon-in-progress\.has-failed-children\s*\{[^}]*color:\s*(#[\da-f]+);/s,
    )?.[1];

    expect(mixedStatusColor).toBe("#f85149");
  });

  it("uses the main glyph for activity and the badge for current outcome", () => {
    for (const icon of [activeTrayIcon, activeUnseenTrayIcon, mixedTrayIcon, mixedUnseenTrayIcon]) {
      expect(icon).toContain('<path fill="#d29922"');
    }

    for (const icon of [activeTrayIcon, activeUnseenTrayIcon]) {
      expect(icon).toContain('<circle cx="35" cy="34" r="9.5" fill="#3fb950"');
    }
    for (const icon of [mixedTrayIcon, mixedUnseenTrayIcon]) {
      expect(icon).toContain('<circle cx="35" cy="34" r="9.5" fill="#f85149"');
    }
  });

  it("uses an unbadged red glyph for errors", () => {
    for (const icon of [errorTrayIcon, errorUnseenTrayIcon]) {
      expect(icon).toContain('<path fill="#f85149"');
      expect(icon).not.toContain("<circle");
    }
  });
});
