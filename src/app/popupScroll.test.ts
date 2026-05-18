import { describe, expect, it } from "vitest";
import { replacePopupHtmlPreservingScroll, type PopupRenderRoot } from "./popupScroll";

describe("replacePopupHtmlPreservingScroll", () => {
  it("keeps the watch list scroll offset when popup content is replaced", () => {
    const root = createPopupRoot(184);

    replacePopupHtmlPreservingScroll(root, "<section>updated</section>");

    expect(root.watchListScrollTop).toBe(184);
    expect(root.innerHTML).toBe("<section>updated</section>");
  });

  it("does not create scroll state when the watch list is absent", () => {
    const root = createPopupRoot(undefined);

    replacePopupHtmlPreservingScroll(root, "<section>updated</section>");

    expect(root.watchListScrollTop).toBeUndefined();
  });
});

function createPopupRoot(initialScrollTop: number | undefined): PopupRenderRoot & {
  watchListScrollTop: number | undefined;
} {
  let watchList = initialScrollTop === undefined ? undefined : { scrollTop: initialScrollTop };
  let markup = "";

  return {
    get watchListScrollTop() {
      return watchList?.scrollTop;
    },
    set innerHTML(value: string) {
      markup = value;
      watchList = initialScrollTop === undefined ? undefined : { scrollTop: 0 };
    },
    get innerHTML() {
      return markup;
    },
    markup: "",
    querySelector(selector: string) {
      return selector === ".watch-list" ? watchList : null;
    },
  } as unknown as PopupRenderRoot & { watchListScrollTop: number | undefined };
}
