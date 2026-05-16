export type WatchState = {
  status: string;
  conclusion: string | null;
};

export type StatusTransition =
  | {
      changed: false;
      notify: false;
    }
  | {
      changed: true;
      notify: true;
      message: string;
    };

export function formatWatchState(state: WatchState): string {
  if (state.status === "completed" && state.conclusion) {
    return `${state.status}:${state.conclusion}`;
  }

  return state.status;
}

export function getStatusTransition(
  previous: WatchState | undefined,
  next: WatchState,
): StatusTransition {
  if (!previous) {
    return { changed: false, notify: false };
  }

  const previousLabel = formatWatchState(previous);
  const nextLabel = formatWatchState(next);

  if (previousLabel === nextLabel) {
    return { changed: false, notify: false };
  }

  return {
    changed: true,
    notify: true,
    message: `${previousLabel} -> ${nextLabel}`,
  };
}

export function isTerminalStatus(state: WatchState): boolean {
  return state.status === "completed";
}
