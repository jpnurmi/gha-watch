import { describe, expect, it } from "vitest";
import { renderWatchLeadingSlot } from "./dragGlyph";

describe("drag glyph rendering", () => {
  it("renders run row leading content with a drag overlay glyph", () => {
    expect(renderWatchLeadingSlot('<span class="watch-leading-icon">status</span>')).toContain(
      '<span class="watch-drag-glyph" aria-hidden="true">',
    );
  });
});
