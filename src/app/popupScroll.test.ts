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

  it("restores focus to a stable action after the whole popup is replaced", () => {
    const root = createPopupRoot(undefined, undefined, {
      action: "refresh",
      focused: true,
    });

    replacePopupHtmlPreservingScroll(root, '<button data-action="refresh">Refresh</button>');

    expect(root.focusedAction).toBe("refresh");
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
  initialButton?: { action: string; focused: boolean },
): PopupRenderRoot & {
  addInputState: FakeAddInputState | undefined;
  focusedAction: string | undefined;
  watchListScrollTop: number | undefined;
} {
  let watchList = initialScrollTop === undefined ? undefined : { scrollTop: initialScrollTop };
  const ownerDocument: { activeElement: unknown } = { activeElement: undefined };
  let addInput = initialInput ? createAddInput(ownerDocument, initialInput) : undefined;
  let button = initialButton ? createButton(ownerDocument, initialButton.action) : undefined;
  let markup = "";

  if (initialInput?.focused) {
    ownerDocument.activeElement = addInput;
  } else if (initialButton?.focused) {
    ownerDocument.activeElement = button;
  }

  return {
    ownerDocument: ownerDocument as unknown as Document,
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
    get focusedAction() {
      return ownerDocument.activeElement === button ? button?.getAttribute("data-action") ?? undefined : undefined;
    },
    set innerHTML(value: string) {
      markup = value;
      watchList = initialScrollTop === undefined ? undefined : { scrollTop: 0 };
      addInput = value.includes('name="url"') ? createAddInput(ownerDocument) : undefined;
      button = value.includes('data-action="refresh"') ? createButton(ownerDocument, "refresh") : undefined;
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

      if (selector.includes("button") || selector.includes("input")) {
        return addInput ?? button;
      }

      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === "input, textarea") {
        return addInput ? [addInput] : [];
      }

      if (selector.includes("button") || selector.includes("input")) {
        return [button, addInput].filter(Boolean);
      }

      return [];
    },
  } as unknown as PopupRenderRoot & {
    addInputState: FakeAddInputState | undefined;
    focusedAction: string | undefined;
    watchListScrollTop: number | undefined;
  };
}

function createAddInput(
  ownerDocument: { activeElement: unknown },
  options?: FakeAddInputOptions,
): HTMLInputElement {
  const input = {
    tagName: "INPUT",
    ownerDocument,
    selectionDirection: "none",
    selectionEnd: options?.selectionEnd ?? 0,
    selectionStart: options?.selectionStart ?? 0,
    value: options?.value ?? "",
    closest() {
      return null;
    },
    getAttribute(name: string) {
      return name === "name" ? "url" : null;
    },
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

function createButton(
  ownerDocument: { activeElement: unknown },
  action: string,
): HTMLButtonElement {
  const button = {
    tagName: "BUTTON",
    ownerDocument,
    closest() {
      return null;
    },
    focus() {
      ownerDocument.activeElement = button;
    },
    getAttribute(name: string) {
      return name === "data-action" ? action : null;
    },
  };

  return button as unknown as HTMLButtonElement;
}
