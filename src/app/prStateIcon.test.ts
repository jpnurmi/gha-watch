import { describe, expect, it } from "vitest";
import { getPrStateIconSvg } from "./prStateIcon";
import type { PrStateTone } from "./viewModel";

describe("getPrStateIconSvg", () => {
  it.each(["draft", "ready", "merged", "closed"] as PrStateTone[])("renders a %s PR state icon", (tone) => {
    const svg = getPrStateIconSvg(tone);

    expect(svg).toContain("<svg");
    expect(svg).toContain("currentColor");
  });

  it("uses distinct merge and closed icon paths", () => {
    expect(getPrStateIconSvg("merged")).not.toBe(getPrStateIconSvg("closed"));
  });
});
