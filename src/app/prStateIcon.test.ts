import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPrStateIconSvg } from "./prStateIcon";
import type { PrStateTone } from "./viewModel";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("getPrStateIconSvg", () => {
  it.each(["draft", "ready", "merged", "closed"] as PrStateTone[])("renders a %s PR state icon", (tone) => {
    const svg = getPrStateIconSvg(tone);

    expect(svg).toContain("<svg");
    expect(svg).toContain("currentColor");
  });

  it("uses GitHub's distinct lifecycle Octicons", () => {
    const icons = (["draft", "ready", "merged", "closed"] as PrStateTone[]).map(getPrStateIconSvg);

    expect(new Set(icons)).toHaveLength(4);
    expect(getPrStateIconSvg("draft")).toContain("M14 7.5a1.25");
    expect(getPrStateIconSvg("ready")).toContain("M1.5 3.25a2.25");
    expect(getPrStateIconSvg("merged")).toContain("M5.45 5.154A4.25");
    expect(getPrStateIconSvg("closed")).toContain("l.97.97.97-.97");
  });

  it("matches workflow and job icon sizing", () => {
    expect(styles).toMatch(/\.pr-state-icon svg\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s);
    expect(styles).toMatch(
      /\.status-icon svg,\s*\.watch-subject-icon svg\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s,
    );
    expect(styles).toMatch(/\.pr-state-icon-draft\s*\{[^}]*color:\s*#9198a1;/s);
    expect(styles).toMatch(/\.pr-state-icon-ready\s*\{[^}]*color:\s*#3fb950;/s);
    expect(styles).toMatch(/\.pr-state-icon-merged\s*\{[^}]*color:\s*#ab7df8;/s);
    expect(styles).toMatch(/\.pr-state-icon-closed\s*\{[^}]*color:\s*#f85149;/s);
  });

});
