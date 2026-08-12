export type PopupRenderRoot = {
  innerHTML: string;
  querySelector<E extends Element = Element>(selector: string): E | null;
};

type PopupScrollPosition = {
  watchListTop?: number;
};

type AddInputState = {
  focused: boolean;
  selectionDirection: "backward" | "forward" | "none" | null;
  selectionEnd: number | null;
  selectionStart: number | null;
  value: string;
};

export type PopupRenderOptions = {
  resetWatchListScroll?: boolean;
};

export function replacePopupHtmlPreservingScroll(
  root: PopupRenderRoot,
  html: string,
  options: PopupRenderOptions = {},
): void {
  const scrollPosition = capturePopupScrollPosition(root);
  const addInputState = captureAddInputState(root);
  const filterInputState = captureInputState(root, 'input[name="watch-filter-query"]');

  root.innerHTML = html;

  if (!options.resetWatchListScroll) {
    restorePopupScrollPosition(root, scrollPosition);
  }
  restoreAddInputState(root, addInputState);
  restoreInputState(root, 'input[name="watch-filter-query"]', filterInputState, false);
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

function captureAddInputState(root: PopupRenderRoot): AddInputState | undefined {
  return captureInputState(root, 'input[name="url"]');
}

function captureInputState(
  root: PopupRenderRoot,
  selector: string,
): AddInputState | undefined {
  const input = root.querySelector<HTMLInputElement>(selector);

  if (!input) {
    return undefined;
  }

  return {
    focused: input.ownerDocument.activeElement === input,
    selectionDirection: input.selectionDirection,
    selectionEnd: input.selectionEnd,
    selectionStart: input.selectionStart,
    value: input.value,
  };
}

function restoreAddInputState(root: PopupRenderRoot, inputState: AddInputState | undefined): void {
  restoreInputState(root, 'input[name="url"]', inputState);
}

function restoreInputState(
  root: PopupRenderRoot,
  selector: string,
  inputState: AddInputState | undefined,
  restoreValue = true,
): void {
  if (!inputState) {
    return;
  }

  const input = root.querySelector<HTMLInputElement>(selector);

  if (!input) {
    return;
  }

  if (restoreValue) {
    input.value = inputState.value;
  }

  if (!inputState.focused) {
    return;
  }

  input.focus();

  if (inputState.selectionStart !== null && inputState.selectionEnd !== null) {
    input.setSelectionRange(
      inputState.selectionStart,
      inputState.selectionEnd,
      inputState.selectionDirection ?? undefined,
    );
  }
}
