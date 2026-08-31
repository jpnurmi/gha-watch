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
  let pendingView: View | undefined;

  async function refresh(view?: View): Promise<void> {
    if (refreshing) {
      pendingView ??= view;
      return;
    }

    refreshing = true;
    deps.onRefreshingChanged(true);

    try {
      await deps.run(view);
    } finally {
      refreshing = false;
      const nextView = pendingView;
      pendingView = undefined;
      deps.onRefreshingChanged(false);
      deps.onSettled();

      if (nextView !== undefined) {
        void refresh(nextView);
      }
    }
  }

  return { refresh };
}
