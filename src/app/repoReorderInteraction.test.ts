import { describe, expect, it } from "vitest";
import {
  didRepoReorderPressMove,
  isRepoReorderLongPress,
  repoReorderClickSuppressMs,
  repoReorderLongPressMs,
  repoReorderMoveTolerancePx,
} from "./repoReorderInteraction";

describe("repo reorder interaction", () => {
  it("starts reorder only after the long-press threshold", () => {
    expect(repoReorderLongPressMs).toBe(350);
    expect(isRepoReorderLongPress(349)).toBe(false);
    expect(isRepoReorderLongPress(350)).toBe(true);
  });

  it("keeps small pointer movement within click tolerance", () => {
    expect(repoReorderMoveTolerancePx).toBe(6);
    expect(didRepoReorderPressMove({ startX: 20, startY: 20, clientX: 26, clientY: 26 })).toBe(false);
    expect(didRepoReorderPressMove({ startX: 20, startY: 20, clientX: 27, clientY: 20 })).toBe(true);
  });

  it("keeps synthetic click suppression short-lived after a completed drag", () => {
    expect(repoReorderClickSuppressMs).toBe(500);
  });
});
