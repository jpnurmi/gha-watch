export function createCoalescedEffect(
  effect: () => void,
  schedule: (callback: () => void) => void = queueMicrotask,
): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      effect();
    });
  };
}
