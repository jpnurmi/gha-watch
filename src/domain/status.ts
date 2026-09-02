export type WatchState = {
  status: string;
  conclusion: string | null;
  hasFailedChildren?: boolean;
};

export type StatusTransition =
  | {
      changed: false;
      notify: false;
    }
  | {
      changed: true;
      notify: boolean;
    };

export function formatWatchState(state: WatchState): string {
  if (state.status === "completed" && state.conclusion) {
    return `${state.status}:${state.conclusion}`;
  }

  if (state.hasFailedChildren) {
    return `${state.status}:failure`;
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
    notify: isInterestingNotificationState(next),
  };
}

export function isTerminalStatus(state: WatchState): boolean {
  return state.status === "completed" && state.conclusion === "success";
}

function isInterestingNotificationState(state: WatchState): boolean {
  if (state.status !== "completed") {
    return false;
  }

  return state.conclusion === "success" || isFailureConclusion(state.conclusion);
}

function isFailureConclusion(conclusion: string | null): boolean {
  return Boolean(conclusion && conclusion !== "cancelled" && conclusion !== "skipped");
}
