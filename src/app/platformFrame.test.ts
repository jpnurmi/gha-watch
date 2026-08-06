import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("platform frame styling", () => {
  it("detects Linux separately from the default popup frame", () => {
    expect(mainSource).toContain("getUiPlatform(navigator.userAgent)");
    expect(mainSource).toContain("if (/\\bLinux\\b/i.test(userAgent))");
  });

  it("uses square bottom frame corners on Linux", () => {
    expect(styles).toMatch(
      /:root\[data-platform="linux"\] \.shell\s*\{[^}]*border-radius:\s*12px 12px 0 0;/s,
    );
  });
});
