export type PopupRenderRoot = {
  innerHTML: string;
  querySelector<E extends Element = Element>(selector: string): E | null;
};

type PopupScrollPosition = {
  watchListTop?: number;
};

export function replacePopupHtmlPreservingScroll(root: PopupRenderRoot, html: string): void {
  const scrollPosition = capturePopupScrollPosition(root);

  root.innerHTML = html;

  restorePopupScrollPosition(root, scrollPosition);
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
