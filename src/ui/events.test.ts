// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { createEventDelegate } from "./events";
import { reconcileHtml } from "./reconcile";

it("handles replaced and retained buttons once through the stable root", () => {
  const root = document.createElement('main');
  const click = vi.fn();
  const on = createEventDelegate(root);
  on("click", '[data-action="save"]', click);
  for (const label of ['One', 'Two', 'Three']) {
    reconcileHtml(root, `<button data-action="save"><span>${label}</span></button>`);
    root.querySelector('span')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  expect(click).toHaveBeenCalledTimes(3);
  expect(click.mock.calls[2][1]).toBe(root.firstElementChild);
});

it("ignores descendant leave events until the row itself is left", () => {
  const root = document.createElement('main');
  root.innerHTML = '<div class="watch"><button>Save</button></div>';
  const leave = vi.fn();
  createEventDelegate(root)("mouseleave", '.watch', leave);
  root.querySelector('button')!.dispatchEvent(new MouseEvent('mouseleave'));
  expect(leave).not.toHaveBeenCalled();
  root.firstElementChild!.dispatchEvent(new MouseEvent('mouseleave'));
  expect(leave).toHaveBeenCalledOnce();
});
