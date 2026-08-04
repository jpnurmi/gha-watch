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

export function replacePopupHtmlPreservingScroll(root: PopupRenderRoot, html: string): void {
  const scrollPosition = capturePopupScrollPosition(root);
  const addInputState = captureAddInputState(root);

  root.innerHTML = html;

  restorePopupScrollPosition(root, scrollPosition);
  restoreAddInputState(root, addInputState);
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
  const input = root.querySelector<HTMLInputElement>('input[name="url"]');

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
  if (!inputState) {
    return;
  }

  const input = root.querySelector<HTMLInputElement>('input[name="url"]');

  if (!input) {
    return;
  }

  input.value = inputState.value;

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
