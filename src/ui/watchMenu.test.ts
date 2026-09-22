// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPopupViewModel, createWatchRowViewModel } from "../app/viewModel";
import { addWatch } from "../domain/watches";
import { renderWatch } from "./watchRow";
import { moveWatchMenuFocus, positionWatchMenu, renderRepoMenu } from "./watchMenu";

const [watch] = addWatch([], {
  kind: "run", owner: "owner", repo: "repo", runId: "1",
  url: "https://github.com/owner/repo/actions/runs/1",
});
const row = createWatchRowViewModel(watch, new Date());

beforeEach(() => {
  document.body.innerHTML = "";
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 460 });
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 360 });
});

describe("watch action menu", () => {
  it.each(["inbox", "saved", "done"] as const)("keeps only the prioritized action and More as shortcuts in %s", (triageState) => {
    const current = { ...row, triageState, canRerun: true, canRerunFailed: true };
    document.body.innerHTML = renderWatch(current);
    const shortcuts = Array.from(document.querySelectorAll<HTMLButtonElement>(".watch-action-button"));
    expect(shortcuts.map((button) => button.dataset.action)).toEqual(
      triageState === "done" ? ["toggle-watch-menu"] : ["triage-watch", "toggle-watch-menu"],
    );
    expect(shortcuts[0]?.dataset.triageState).toBe(
      triageState === "inbox" ? "done" : triageState === "saved" ? "inbox" : undefined,
    );
    expect(shortcuts[0]?.title).toBe(
      triageState === "inbox" ? "Done" : triageState === "saved" ? "Move to Inbox" : "More",
    );
    expect(document.querySelector('[data-action="edit-note"]')).toBeNull();
    expect(document.querySelector('[data-action="rerun-all"]')).toBeNull();

    document.body.innerHTML = renderWatch(current, row.id);
    const menu = document.querySelector('[role="menu"]')!;
    expect(menu.querySelector('[data-action="edit-note"]')?.textContent).toContain("Add note…");
    expect(menu.querySelector('[data-action="rerun-all"]')).not.toBeNull();
    expect(menu.querySelector('[data-action="rerun-failed"]')).not.toBeNull();
    expect(menu.querySelector('[data-triage-state="done"]')?.textContent.trim()).toBe(
      triageState === "done" ? undefined : "Mark done",
    );
    expect(menu.querySelector('[data-triage-state="saved"]')?.textContent.trim()).toBe(
      triageState === "saved" ? undefined : "Make draft",
    );
    expect(menu.querySelector('[data-action="clear-done-watch"]') !== null).toBe(triageState === "done");
    expect(Array.from(menu.querySelectorAll<HTMLElement>('[data-action="triage-watch"]'))
      .map((item) => item.dataset.triageState)).toEqual(
        triageState === "inbox" ? ["saved", "done"] : triageState === "saved" ? ["inbox", "done"] : ["inbox", "saved"],
      );
    for (const item of menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) {
      expect(item.dataset.rowIds).toBe(row.id);
    }
  });

  it("shows actions appropriate to the item's current state", () => {
    document.body.innerHTML = renderWatch({ ...row, note: "Reminder", unseenStatusChange: true }, row.id);
    expect(document.querySelector('[role="menuitem"][data-action="edit-note"]')?.textContent).toContain("Edit note…");
    expect(document.querySelector('[role="menuitem"][data-action="mark-seen"]')).toBeNull();
    expect(document.querySelector('[data-action="rerun-all"]')).toBeNull();
  });

  it("supports arrow keys, Home, and End without activating an action", () => {
    document.body.innerHTML = renderWatch(row, row.id);
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const click = vi.fn();
    menu.addEventListener("click", click);
    moveWatchMenuFocus(menu, "ArrowDown");
    expect(document.activeElement).toBe(items[0]);
    moveWatchMenuFocus(menu, "ArrowUp");
    expect(document.activeElement).toBe(items.at(-1));
    moveWatchMenuFocus(menu, "ArrowDown");
    expect(document.activeElement).toBe(items[0]);
    moveWatchMenuFocus(menu, "End");
    expect(document.activeElement).toBe(items.at(-1));
    moveWatchMenuFocus(menu, "Home");
    expect(document.activeElement).toBe(items[0]);
    expect(moveWatchMenuFocus(menu, "Escape")).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it.each([[10, 32], [320, 156]])("keeps the menu visible when its button is at y=%s", (top, expected) => {
    document.body.innerHTML = renderWatch(row, row.id);
    const button = document.querySelector<HTMLElement>('[data-action="toggle-watch-menu"]')!;
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(422, top, 18, 18));
    vi.spyOn(menu, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 240, 160));
    positionWatchMenu(document.body);
    expect(menu.style.left).toBe("200px");
    expect(menu.style.top).toBe(`${expected}px`);
  });

  it("limits a tall menu to the available space without covering its button", () => {
    document.body.innerHTML = renderWatch(row, row.id);
    const button = document.querySelector<HTMLElement>('[data-action="toggle-watch-menu"]')!;
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(422, 150, 18, 18));
    vi.spyOn(menu, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 240, 200));
    positionWatchMenu(document.body);
    expect(menu.style.top).toBe("172px");
    expect(menu.style.maxHeight).toBe("180px");
  });
});

describe("repository action menu", () => {
  const group = createPopupViewModel([watch]).groups[0];
  const current = {
    ...group,
    rows: [row, createWatchRowViewModel({ ...watch, id: "owner/repo/run/2", active: false }, new Date())],
  };

  it.each(["inbox", "saved", "done"] as const)("offers bulk actions for the repository's %s items", (state) => {
    document.body.innerHTML = renderRepoMenu(current, state, false);
    expect(document.querySelector('[data-action="toggle-watch-menu"]')).not.toBeNull();
    expect(document.querySelector('[data-action="triage-watch"]')).toBeNull();

    document.body.innerHTML = renderRepoMenu(current, state, true);
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items.map((item) => item.textContent.trim())).toEqual(
      state === "inbox" ? ["Make all drafts", "Mark all done", "Mark finished done"]
        : state === "saved" ? ["Move all to Inbox", "Mark all done", "Mark finished done"]
          : ["Move all to Inbox", "Make all drafts", "Remove all"],
    );
    expect(items.map((item) => item.dataset.triageState)).toEqual(
      state === "inbox" ? ["saved", "done", "done"]
        : state === "saved" ? ["inbox", "done", "done"] : ["inbox", "saved", undefined],
    );
    for (const item of items) {
      expect(item.dataset.rowIds?.split("\n")).toEqual(
        item.textContent.trim() === "Mark finished done"
          ? ["owner/repo/run/2"] : current.rows.map((row) => row.id),
      );
      expect(item.hasAttribute("disabled")).toBe(false);
    }
    expect(document.querySelector('[data-action="clear-done-watch"]') !== null).toBe(state === "done");
  });

  it("omits bulk actions for an empty repository", () => {
    expect(renderRepoMenu({ ...group, rows: [] }, "inbox", true)).toBe("");
  });

  it("disables the finished action when everything is active and skips it with arrow keys", () => {
    document.body.innerHTML = renderRepoMenu(group, "inbox", true);
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items[2].textContent.trim()).toBe("Mark finished done");
    expect(items[2].disabled).toBe(true);
    moveWatchMenuFocus(menu, "End");
    expect(document.activeElement).toBe(items[1]);
    moveWatchMenuFocus(menu, "ArrowDown");
    expect(document.activeElement).toBe(items[0]);
    moveWatchMenuFocus(menu, "ArrowUp");
    expect(document.activeElement).toBe(items[1]);
  });

  it("uses activity rather than display errors to identify finished items", () => {
    const failedRefresh = createPopupViewModel([
      { ...watch, id: "active", active: true, error: "Offline" },
      { ...watch, id: "finished", active: false, error: "Offline" },
    ]).groups[0];
    document.body.innerHTML = renderRepoMenu(failedRefresh, "inbox", true);
    const action = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((item) => item.textContent.trim() === "Mark finished done")!;
    expect(action.disabled).toBe(false);
    expect(action.dataset.rowIds).toBe("finished");
  });
});
