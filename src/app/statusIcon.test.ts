import { describe, expect, it } from "vitest";
import { getStatusIconSvg } from "./statusIcon";

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
});
