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
): PopupRenderRoot & {
  addInputState: FakeAddInputState | undefined;
  watchListScrollTop: number | undefined;
} {
  let watchList = initialScrollTop === undefined ? undefined : { scrollTop: initialScrollTop };
  const ownerDocument: { activeElement: unknown } = { activeElement: undefined };
  let addInput = initialInput ? createAddInput(ownerDocument, initialInput) : undefined;
  let markup = "";

  if (initialInput?.focused) {
    ownerDocument.activeElement = addInput;
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
    set innerHTML(value: string) {
      markup = value;
      watchList = initialScrollTop === undefined ? undefined : { scrollTop: 0 };
      addInput = value.includes('name="url"') ? createAddInput(ownerDocument) : undefined;
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

      return null;
    },
  } as unknown as PopupRenderRoot & {
    addInputState: FakeAddInputState | undefined;
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
