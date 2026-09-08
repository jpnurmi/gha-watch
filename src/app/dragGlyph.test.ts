import { describe, expect, it } from "vitest";
import { renderWatchLeadingSlot } from "./dragGlyph";

describe("drag glyph rendering", () => {
  it("renders run row leading content with a drag overlay glyph", () => {
    expect(renderWatchLeadingSlot('<span class="watch-leading-icon">status</span>')).toContain(
      '<span class="watch-drag-glyph" aria-hidden="true">',
    );
  });

  it("renders unseen status changes as a clickable leading icon overlay", () => {
    expect(
      renderWatchLeadingSlot(
        '<span class="watch-leading-icon">status</span>',
        '<button class="watch-leading-seen-button" type="button" data-action="mark-seen" data-id="watch-id" title="Mark seen" aria-label="Mark CI seen"><span class="unseen-dot" aria-hidden="true"></span></button>',
      ),
    ).toContain('<button class="watch-leading-seen-button" type="button" data-action="mark-seen"');
  });
});
