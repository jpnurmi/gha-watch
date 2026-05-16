import { describe, expect, it } from "vitest";
import { getRerunActionIconSvg } from "./actionIcon";

describe("getRerunActionIconSvg", () => {
  it("uses a filled icon so the visible glyph centers in the action button", () => {
    const svg = getRerunActionIconSvg();

    expect(svg).toContain('viewBox="0 0 16 16"');
    expect(svg).toContain('fill="currentColor"');
    expect(svg).not.toContain("stroke=");
  });
});
