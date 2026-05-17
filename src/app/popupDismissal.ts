export type PopupUiState = {
  clearMenuOpen: boolean;
};

export function dismissPopupUi(state: PopupUiState): PopupUiState {
  return {
    ...state,
    clearMenuOpen: false,
  };
}
