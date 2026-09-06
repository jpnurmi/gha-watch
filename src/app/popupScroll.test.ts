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

  it("keeps the discovery list scroll offset when a suggestion is removed", () => {
    const root = createPopupRoot(undefined, undefined, 132);

    replacePopupHtmlPreservingScroll(root, '<ul class="add-discovery-list">updated</ul>');

    expect(root.discoveryListScrollTop).toBe(132);
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
  initialDiscoveryScrollTop?: number,
  inputName = "url",
  draftKey?: string,
): PopupRenderRoot & {
  addInputState: FakeAddInputState | undefined;
  discoveryListScrollTop: number | undefined;
  watchListScrollTop: number | undefined;
} {
  let watchList = initialScrollTop === undefined ? undefined : { scrollTop: initialScrollTop };
  let discoveryList = initialDiscoveryScrollTop === undefined
    ? undefined
    : { scrollTop: initialDiscoveryScrollTop };
  const ownerDocument: { activeElement: unknown } = { activeElement: undefined };
  let addInput = initialInput ? createAddInput(ownerDocument, initialInput, draftKey) : undefined;
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
    get discoveryListScrollTop() {
      return discoveryList?.scrollTop;
    },
    set innerHTML(value: string) {
      markup = value;
      watchList = initialScrollTop === undefined ? undefined : { scrollTop: 0 };
      discoveryList = value.includes('class="add-discovery-list"')
        ? { scrollTop: 0 }
        : undefined;
      addInput = value.includes(`name="${inputName}"`)
        ? createAddInput(ownerDocument, undefined, value.match(/data-draft-key="([^"]*)"/)?.[1])
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

      if (selector === ".add-discovery-list") {
        return discoveryList;
      }

      if (selector === `input[name="${inputName}"]`) {
        return addInput;
      }

      return null;
    },
  } as unknown as PopupRenderRoot & {
    addInputState: FakeAddInputState | undefined;
    discoveryListScrollTop: number | undefined;
    watchListScrollTop: number | undefined;
  };
}

function createAddInput(
  ownerDocument: { activeElement: unknown },
  options?: FakeAddInputOptions,
  draftKey?: string,
): HTMLInputElement {
  const input = {
    ownerDocument,
    dataset: { draftKey },
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


describe("branch pattern drafts", () => {
  const draft: FakeAddInputOptions = {
    focused: true, selectionStart: 2, selectionEnd: 7, value: "release/*",
  };

  it("preserves the draft, focus, and selection during refresh", () => {
    const root = createPopupRoot(undefined, draft, undefined, "pattern", "getsentry/sentry/include");

    replacePopupHtmlPreservingScroll(root, '<input name="pattern" data-draft-key="getsentry/sentry/include" />');

    expect(root.addInputState).toEqual({ ...draft, selectionDirection: "none" });
  });

  it.each(["getsentry/relay/include", "getsentry/sentry/exclude"])("starts a fresh draft for %s", (key) => {
    const root = createPopupRoot(undefined, draft, undefined, "pattern", "getsentry/sentry/include");

    replacePopupHtmlPreservingScroll(root, `<input name="pattern" data-draft-key="${key}" />`);

    expect(root.addInputState?.value).toBe("");
  });

  it("does not restore a submitted or closed editor", () => {
    const root = createPopupRoot(undefined, draft, undefined, "pattern", "getsentry/sentry/include");

    replacePopupHtmlPreservingScroll(root, "<section>updated</section>");
    replacePopupHtmlPreservingScroll(root, '<input name="pattern" data-draft-key="getsentry/sentry/include" />');

    expect(root.addInputState?.value).toBe("");
  });
});
