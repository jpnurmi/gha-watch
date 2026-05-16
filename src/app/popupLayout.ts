export type PopupBodySection = "watch-list" | "add-form";
export type AddFormAction = "dismiss" | "submit";

export function getPopupBodySections(isAdding: boolean): PopupBodySection[] {
  return isAdding ? ["watch-list", "add-form"] : ["watch-list"];
}

export function getAddFormActions(): AddFormAction[] {
  return ["dismiss", "submit"];
}
