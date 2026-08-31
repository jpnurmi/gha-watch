export type RefreshCoordinator<View> = {
  refresh(view?: View): Promise<void>;
};

type RefreshCoordinatorDeps<View> = {
  onRefreshingChanged(refreshing: boolean): void;
  onSettled(): void;
  run(view?: View): Promise<void>;
};

export function createRefreshCoordinator<View>(
  deps: RefreshCoordinatorDeps<View>,
): RefreshCoordinator<View> {
  let refreshing = false;
  let pending = false;
  let pendingView: View | undefined;

  async function refresh(view?: View): Promise<void> {
    if (refreshing) {
      pending = true;
      pendingView ??= view;
      return;
    }

    refreshing = true;
    deps.onRefreshingChanged(true);

    try {
      await deps.run(view);
    } finally {
      refreshing = false;
      const hasPendingRefresh = pending;
      const nextView = pendingView;
      pending = false;
      pendingView = undefined;
      deps.onRefreshingChanged(false);
      deps.onSettled();

      if (hasPendingRefresh) {
        void refresh(nextView);
      }
    }
  }

  return { refresh };
}
