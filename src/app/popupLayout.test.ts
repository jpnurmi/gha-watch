import { describe, expect, it } from "vitest";
import { getAddFormActions, getPopupBodySections } from "./popupLayout";

describe("getPopupBodySections", () => {
  it("places the add form after the watch list when adding", () => {
    expect(getPopupBodySections(true)).toEqual(["watch-list", "add-form"]);
  });

  it("only renders the watch list when not adding", () => {
    expect(getPopupBodySections(false)).toEqual(["watch-list"]);
  });
});

describe("getAddFormActions", () => {
  it("includes a dismiss action before the submit action", () => {
    expect(getAddFormActions()).toEqual(["dismiss", "submit"]);
  });
});
