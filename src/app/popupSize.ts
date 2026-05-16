export const popupWidth = 420;
export const popupMinHeight = 360;
export const popupMaxHeight = 560;

export function calculatePopupHeight(contentHeight: number): number {
  return Math.max(popupMinHeight, Math.min(Math.ceil(contentHeight), popupMaxHeight));
}
