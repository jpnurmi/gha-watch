export type PopupRenderRoot = {
  innerHTML: string;
  querySelector<E extends Element = Element>(selector: string): E | null;
};

type PopupScrollPosition = {
  discoveryListTop?: number;
  watchListTop?: number;
};

type InputState = {
  draftKey?: string;
  focused: boolean;
  selectionDirection: "backward" | "forward" | "none" | null;
  selectionEnd: number | null;
  selectionStart: number | null;
  value: string;
};

export function replacePopupHtmlPreservingScroll(root: PopupRenderRoot, html: string): void {
  const scrollPosition = capturePopupScrollPosition(root);
  const inputStates = ['input[name="url"]', 'input[name="pattern"]'].map((selector) => ({
    selector,
    state: captureInputState(root, selector),
  }));

  root.innerHTML = html;

  restorePopupScrollPosition(root, scrollPosition);
  for (const { selector, state } of inputStates) {
    restoreInputState(root, selector, state);
  }
}

function capturePopupScrollPosition(root: PopupRenderRoot): PopupScrollPosition {
  const watchList = root.querySelector<HTMLElement>(".watch-list");
  const discoveryList = root.querySelector<HTMLElement>(".add-discovery-list");

  return {
    ...(watchList ? { watchListTop: watchList.scrollTop } : {}),
    ...(discoveryList ? { discoveryListTop: discoveryList.scrollTop } : {}),
  };
}

function restorePopupScrollPosition(root: PopupRenderRoot, scrollPosition: PopupScrollPosition): void {
  if (scrollPosition.watchListTop !== undefined) {
    const watchList = root.querySelector<HTMLElement>(".watch-list");

    if (watchList) {
      watchList.scrollTop = scrollPosition.watchListTop;
    }
  }

  if (scrollPosition.discoveryListTop !== undefined) {
    const discoveryList = root.querySelector<HTMLElement>(".add-discovery-list");

    if (discoveryList) {
      discoveryList.scrollTop = scrollPosition.discoveryListTop;
    }
  }
}

function captureInputState(root: PopupRenderRoot, selector: string): InputState | undefined {
  const input = root.querySelector<HTMLInputElement>(selector);

  if (!input) {
    return undefined;
  }

  return {
    draftKey: input.dataset.draftKey,
    focused: input.ownerDocument.activeElement === input,
    selectionDirection: input.selectionDirection,
    selectionEnd: input.selectionEnd,
    selectionStart: input.selectionStart,
    value: input.value,
  };
}

function restoreInputState(root: PopupRenderRoot, selector: string, inputState: InputState | undefined): void {
  if (!inputState) {
    return;
  }

  const input = root.querySelector<HTMLInputElement>(selector);

  if (!input || input.dataset.draftKey !== inputState.draftKey) {
    return;
  }

  input.value = inputState.value;

  if (!inputState.focused) {
    return;
  }

  input.focus({ preventScroll: true });

  if (inputState.selectionStart !== null && inputState.selectionEnd !== null) {
    input.setSelectionRange(
      inputState.selectionStart,
      inputState.selectionEnd,
      inputState.selectionDirection ?? undefined,
    );
  }
}
