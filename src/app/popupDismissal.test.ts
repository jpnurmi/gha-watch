import { describe, expect, it } from "vitest";
import { dismissPopupUi } from "./popupDismissal";

describe("dismissPopupUi", () => {
  it("closes the overflow menu before the popup is hidden", () => {
    expect(
      dismissPopupUi({
        clearMenuOpen: true,
      }),
    ).toEqual({
      clearMenuOpen: false,
    });
  });
});
