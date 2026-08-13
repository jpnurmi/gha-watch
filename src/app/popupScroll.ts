export type PopupRenderRoot = {
  innerHTML: string;
  ownerDocument?: Document;
  querySelector<E extends Element = Element>(selector: string): E | null;
  querySelectorAll<E extends Element = Element>(selector: string): NodeListOf<E> | E[];
};

type PopupScrollPosition = {
  watchListTop?: number;
};

export type PopupFocusReference = {
  key: string;
  occurrence: number;
};

type TextControlState = PopupFocusReference & {
  selectionDirection: "backward" | "forward" | "none" | null;
  selectionEnd: number | null;
  selectionStart: number | null;
  value: string;
};

const focusableSelector = [
  "button",
  "input",
  "select",
  "textarea",
  "[href]",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

export function replacePopupHtmlPreservingScroll(root: PopupRenderRoot, html: string): void {
  const scrollPosition = capturePopupScrollPosition(root);
  const textControlStates = captureTextControlStates(root);
  const focusReference = capturePopupFocus(root);

  root.innerHTML = html;

  restorePopupScrollPosition(root, scrollPosition);
  restoreTextControlStates(root, textControlStates);
  restorePopupFocus(root, focusReference);
}

export function createPopupFocusReference(
  root: PopupRenderRoot,
  element: Element,
): PopupFocusReference | undefined {
  const key = getPopupFocusKey(element);

  if (!key) {
    return undefined;
  }

  const matchingElements = getFocusableElements(root).filter(
    (candidate) => getPopupFocusKey(candidate) === key,
  );
  const occurrence = matchingElements.indexOf(element as HTMLElement);

  return occurrence >= 0 ? { key, occurrence } : undefined;
}

export function restorePopupFocus(
  root: PopupRenderRoot,
  reference: PopupFocusReference | undefined,
): void {
  if (!reference) {
    return;
  }

  const element = getFocusableElements(root)
    .filter((candidate) => getPopupFocusKey(candidate) === reference.key)
    .at(reference.occurrence);

  element?.focus();
}

function capturePopupScrollPosition(root: PopupRenderRoot): PopupScrollPosition {
  const watchList = root.querySelector<HTMLElement>(".watch-list");

  return watchList ? { watchListTop: watchList.scrollTop } : {};
}

function restorePopupScrollPosition(root: PopupRenderRoot, scrollPosition: PopupScrollPosition): void {
  if (scrollPosition.watchListTop === undefined) {
    return;
  }

  const watchList = root.querySelector<HTMLElement>(".watch-list");

  if (watchList) {
    watchList.scrollTop = scrollPosition.watchListTop;
  }
}

function capturePopupFocus(root: PopupRenderRoot): PopupFocusReference | undefined {
  const ownerDocument = root.ownerDocument ?? root.querySelector<HTMLElement>(focusableSelector)?.ownerDocument;
  const activeElement = ownerDocument?.activeElement;
  return activeElement ? createPopupFocusReference(root, activeElement) : undefined;
}

function captureTextControlStates(root: PopupRenderRoot): TextControlState[] {
  return Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))
    .map((control) => {
      const reference = createPopupFocusReference(root, control);

      return reference
        ? {
            ...reference,
            selectionDirection: control.selectionDirection,
            selectionEnd: control.selectionEnd,
            selectionStart: control.selectionStart,
            value: control.value,
          }
        : undefined;
    })
    .filter((state): state is TextControlState => Boolean(state));
}

function restoreTextControlStates(root: PopupRenderRoot, states: TextControlState[]): void {
  const controls = Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"),
  );

  for (const state of states) {
    const control = controls
      .filter((candidate) => getPopupFocusKey(candidate) === state.key)
      .at(state.occurrence);

    if (!control) {
      continue;
    }

    control.value = state.value;

    if (state.selectionStart !== null && state.selectionEnd !== null) {
      control.setSelectionRange(
        state.selectionStart,
        state.selectionEnd,
        state.selectionDirection ?? undefined,
      );
    }
  }
}

function getFocusableElements(root: PopupRenderRoot): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector));
}

function getPopupFocusKey(element: Element): string | undefined {
  const tagName = element.tagName?.toLowerCase();

  if (!tagName) {
    return undefined;
  }

  const attributes = [
    "name",
    "role",
    "data-action",
    "data-id",
    "data-pr",
    "data-repo",
    "data-role",
    "data-row-ids",
    "data-run",
    "data-scope",
    "data-tree-node",
    "data-triage-state",
    "data-watch-view",
    "data-workflow",
  ];
  const ownKey = attributes
    .map((attribute) => [attribute, element.getAttribute(attribute)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null)
    .map(([attribute, value]) => `${attribute}=${value}`)
    .join("|");
  const repoKey = element.closest<HTMLElement>(".watch-group[data-repo]")?.dataset.repo ?? "";
  const reorderKey = element.closest<HTMLElement>("[data-reorder-key]")?.dataset.reorderKey ?? "";

  return `${tagName}|${ownKey}|repo=${repoKey}|reorder=${reorderKey}`;
}
