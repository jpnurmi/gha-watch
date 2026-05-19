import { describe, expect, it } from "vitest";
import { calculatePopupHeight, popupWidth } from "./popupSize";

describe("calculatePopupHeight", () => {
  it("keeps enough popup width for nested check hierarchy", () => {
    expect(popupWidth).toBe(460);
  });

  it("keeps short content at the compact popup height", () => {
    expect(calculatePopupHeight(280)).toBe(360);
  });

  it("grows to fit moderate content before scrolling", () => {
    expect(calculatePopupHeight(492)).toBe(492);
  });

  it("caps tall content so long lists still scroll", () => {
    expect(calculatePopupHeight(900)).toBe(560);
  });
});
