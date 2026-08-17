import { describe, expect, it } from "vitest";
import { renderTitleMarkup } from "./titleMarkup";

describe("title markup", () => {
  it("renders backtick-delimited text as inline code", () => {
    expect(renderTitleMarkup("feat: add `on_crashed_last_run` callback")).toBe(
      "feat: add <code>on_crashed_last_run</code> callback",
    );
  });

  it("renders multiple code spans", () => {
    expect(renderTitleMarkup("use `foo` with `bar`")).toBe(
      "use <code>foo</code> with <code>bar</code>",
    );
  });

  it("escapes HTML inside and outside code spans", () => {
    expect(renderTitleMarkup("fix <input> in `<select>`")).toBe(
      "fix &lt;input&gt; in <code>&lt;select&gt;</code>",
    );
  });

  it("keeps unmatched backticks literal", () => {
    expect(renderTitleMarkup("fix `unfinished title")).toBe("fix `unfinished title");
  });
});
