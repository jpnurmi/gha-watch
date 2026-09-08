import { expect, it, vi } from "vitest";
import { createCoalescedEffect } from "./coalescedEffect";

it("renders the latest state once per scheduled batch", () => {
  const callbacks: Array<() => void> = [];
  let state = 0;
  const render = vi.fn(() => state);
  const schedule = createCoalescedEffect(render, (callback) => callbacks.push(callback));
  schedule();
  state = 1;
  schedule();
  state = 2;
  schedule();
  expect(callbacks).toHaveLength(1);
  callbacks.shift()!();
  expect(render).toHaveReturnedWith(2);
  schedule();
  expect(callbacks).toHaveLength(1);
});
