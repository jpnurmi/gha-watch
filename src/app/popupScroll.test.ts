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

  it("keeps the add input value and focus when popup content is replaced", () => {
    const root = createPopupRoot(undefined, {
      focused: true,
      selectionEnd: 10,
      selectionStart: 10,
      value: "owner/repo#1234",
    });

    replacePopupHtmlPreservingScroll(root, '<form><input name="url" /></form>');

    expect(root.addInputState).toEqual({
      focused: true,
      selectionDirection: "none",
      selectionEnd: 10,
      selectionStart: 10,
      value: "owner/repo#1234",
    });
  });

  it("keeps the filter query selection and focus while filtering", () => {
    const root = createPopupRoot(184, undefined, {
      focused: true,
      selectionEnd: 5,
      selectionStart: 2,
      value: "build",
    });

    replacePopupHtmlPreservingScroll(root, '<input name="watch-filter-query" value="build" />');

    expect(root.filterInputState).toEqual({
      focused: true,
      selectionDirection: "none",
      selectionEnd: 5,
      selectionStart: 2,
      value: "build",
    });
  });

  it("resets the watch list scroll offset when filters change", () => {
    const root = createPopupRoot(184);

    replacePopupHtmlPreservingScroll(root, "<section>filtered</section>", {
      resetWatchListScroll: true,
    });

    expect(root.watchListScrollTop).toBe(0);
  });
});

type FakeAddInputOptions = {
  focused: boolean;
  selectionEnd: number | null;
  selectionStart: number | null;
  value: string;
};

type FakeAddInputState = FakeAddInputOptions & {
  selectionDirection: "backward" | "forward" | "none" | null;
};

function createPopupRoot(
  initialScrollTop: number | undefined,
  initialInput?: FakeAddInputOptions,
  initialFilterInput?: FakeAddInputOptions,
): PopupRenderRoot & {
  addInputState: FakeAddInputState | undefined;
  filterInputState: FakeAddInputState | undefined;
  watchListScrollTop: number | undefined;
} {
  let watchList = initialScrollTop === undefined ? undefined : { scrollTop: initialScrollTop };
  const ownerDocument: { activeElement: unknown } = { activeElement: undefined };
  let addInput = initialInput ? createAddInput(ownerDocument, initialInput) : undefined;
  let filterInput = initialFilterInput ? createAddInput(ownerDocument, initialFilterInput) : undefined;
  let markup = "";

  if (initialInput?.focused) {
    ownerDocument.activeElement = addInput;
  } else if (initialFilterInput?.focused) {
    ownerDocument.activeElement = filterInput;
  }

  return {
    get addInputState() {
      return addInput
        ? {
            focused: ownerDocument.activeElement === addInput,
            selectionDirection: addInput.selectionDirection,
            selectionEnd: addInput.selectionEnd,
            selectionStart: addInput.selectionStart,
            value: addInput.value,
          }
        : undefined;
    },
    get watchListScrollTop() {
      return watchList?.scrollTop;
    },
    get filterInputState() {
      return filterInput
        ? {
            focused: ownerDocument.activeElement === filterInput,
            selectionDirection: filterInput.selectionDirection,
            selectionEnd: filterInput.selectionEnd,
            selectionStart: filterInput.selectionStart,
            value: filterInput.value,
          }
        : undefined;
    },
    set innerHTML(value: string) {
      markup = value;
      watchList = initialScrollTop === undefined ? undefined : { scrollTop: 0 };
      addInput = value.includes('name="url"') ? createAddInput(ownerDocument) : undefined;
      filterInput = value.includes('name="watch-filter-query"')
        ? createAddInput(ownerDocument, {
            focused: false,
            selectionEnd: 0,
            selectionStart: 0,
            value: value.match(/name="watch-filter-query"[^>]*value="([^"]*)"/)?.[1] ?? "",
          })
        : undefined;
    },
    get innerHTML() {
      return markup;
    },
    markup: "",
    querySelector(selector: string) {
      if (selector === ".watch-list") {
        return watchList;
      }

      if (selector === 'input[name="url"]') {
        return addInput;
      }

      if (selector === 'input[name="watch-filter-query"]') {
        return filterInput;
      }

      return null;
    },
  } as unknown as PopupRenderRoot & {
      addInputState: FakeAddInputState | undefined;
      filterInputState: FakeAddInputState | undefined;
      watchListScrollTop: number | undefined;
  };
}

function createAddInput(
  ownerDocument: { activeElement: unknown },
  options?: FakeAddInputOptions,
): HTMLInputElement {
  const input = {
    ownerDocument,
    selectionDirection: "none",
    selectionEnd: options?.selectionEnd ?? 0,
    selectionStart: options?.selectionStart ?? 0,
    value: options?.value ?? "",
    focus() {
      ownerDocument.activeElement = input;
    },
    setSelectionRange(
      start: number,
      end: number,
      direction?: "backward" | "forward" | "none" | null,
    ) {
      input.selectionStart = start;
      input.selectionEnd = end;
      input.selectionDirection = direction ?? "none";
    },
  };

  return input as unknown as HTMLInputElement;
}
