export function createEventDelegate(root: HTMLElement) {
  return function on<K extends keyof HTMLElementEventMap, E extends HTMLElement = HTMLElement>(
    type: K,
    selector: string,
    handler: (event: HTMLElementEventMap[K], target: E) => void,
  ): void {
    const direct = type === "mouseleave" || type === "mouseenter";
    root.addEventListener(type, (event) => {
      if (!(event.target instanceof Element)) return;
      const target = direct
        ? (event.target.matches(selector) ? event.target : null)
        : event.target.closest(selector);
      if (target instanceof HTMLElement && root.contains(target)) handler(event, target as E);
    }, direct);
  };
}
