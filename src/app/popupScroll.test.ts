// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { replacePopupHtmlPreservingScroll } from "./popupScroll";

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<main></main>';
  root = document.querySelector('main')!;
});

function html(key = "owner/repo/include", status = "Loading"): string {
  return `<section class="shell"><ul class="watch-list"><li data-id="1">${status}</li></ul>
    <form class="add-form"><div class="status">${status}</div><input name="url" /></form>
    <form class="pattern-form"><input name="pattern" data-draft-key="${key}" /></form></section>`;
}

describe("popup updates", () => {
  it("preserves roots, editable nodes, selection, and scroll during refresh", () => {
    replacePopupHtmlPreservingScroll(root, html());
    const shell = root.firstElementChild;
    const list = root.querySelector<HTMLElement>('.watch-list')!;
    list.scrollTop = 120;
    const input = root.querySelector<HTMLInputElement>('[name="pattern"]')!;
    input.value = "release/*";
    input.focus();
    input.setSelectionRange(2, 7, "backward");
    replacePopupHtmlPreservingScroll(root, html(undefined, "Updated"));
    expect(root.firstElementChild).toBe(shell);
    expect(root.querySelector('.watch-list')).toBe(list);
    expect(list.scrollTop).toBe(120);
    expect(root.querySelector('[name="pattern"]')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("release/*");
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([2, 7, "backward"]);
    expect(list.textContent).toBe("Updated");
  });

  it("preserves manual input when discovery changes element type", () => {
    replacePopupHtmlPreservingScroll(root, html());
    const input = root.querySelector<HTMLInputElement>('[name="url"]')!;
    input.value = "owner/repo#12";
    replacePopupHtmlPreservingScroll(root, html().replace('<div class="status">Loading</div>', '<ul class="add-discovery-list"><li>PR</li></ul>'));
    expect(root.querySelector('[name="url"]')).toBe(input);
    expect(input.value).toBe("owner/repo#12");
  });

  it.each(["owner/other/include", "owner/repo/exclude"])("starts a fresh draft for %s", (key) => {
    replacePopupHtmlPreservingScroll(root, html());
    const input = root.querySelector<HTMLInputElement>('[name="pattern"]')!;
    input.value = "release/*";
    replacePopupHtmlPreservingScroll(root, html(key));
    expect(root.querySelector('[name="pattern"]')).not.toBe(input);
    expect(root.querySelector<HTMLInputElement>('[name="pattern"]')!.value).toBe("");
  });

  it("does not restore a submitted or closed editor", () => {
    replacePopupHtmlPreservingScroll(root, html());
    root.querySelector<HTMLInputElement>('[name="pattern"]')!.value = "release/*";
    replacePopupHtmlPreservingScroll(root, '<section class="shell"></section>');
    replacePopupHtmlPreservingScroll(root, html());
    expect(root.querySelector<HTMLInputElement>('[name="pattern"]')!.value).toBe("");
  });

  it("reorders keyed rows without replacing them or retaining removed rows", () => {
    replacePopupHtmlPreservingScroll(root, '<ul><li data-id="1">One</li><li data-id="2">Two</li><li data-id="3">Three</li></ul>');
    const first = root.querySelector('[data-id="1"]');
    const second = root.querySelector('[data-id="2"]');
    replacePopupHtmlPreservingScroll(root, '<ul><li data-id="2">Updated</li><li data-id="1">One</li></ul>');
    expect(Array.from(root.querySelectorAll('li'))).toEqual([second, first]);
    expect(second?.textContent).toBe("Updated");
  });
});
