import { getWatchTriageState, type WatchRecord, type WatchTriageState } from "../domain/watches";
import {
  isVerifiedGitHubNotificationUrl,
  type DesktopNotificationAction,
} from "../platform/notifications";
import { canRerunFailed } from "./viewModel";

const duplicateActionWindowMs = 30_000;
const staleRerunMessage = "Re-run failed is no longer available for this watch.";

export type DesktopNotificationActionController = {
  getWatches(): WatchRecord[];
  markSeen(id: string): void;
  rerun(id: string, mode: "failed"): Promise<void>;
  setTriageState(ids: string[], state: WatchTriageState): void;
  setWatchError(id: string, error: string): void;
};

export type DesktopNotificationActionHandlerDeps = {
  controller: DesktopNotificationActionController;
  clearNotifications(): Promise<void>;
  openUrl(url: string): Promise<void>;
  queueSync(): void;
  refreshAfterRerun(id: string): void;
  refreshStaleWatch(watch: WatchRecord): Promise<void>;
  reportError(message: string, error?: unknown): void;
  now?(): number;
};

export type DesktopNotificationActionQueue = {
  receive(action: DesktopNotificationAction): void;
  start(handler: (action: DesktopNotificationAction) => Promise<void>): Promise<void>;
  whenIdle(): Promise<void>;
};

export function createDesktopNotificationActionHandler(
  deps: DesktopNotificationActionHandlerDeps,
): (action: DesktopNotificationAction) => Promise<void> {
  const handledAt = new Map<string, number>();

  return async (action) => {
    const now = deps.now?.() ?? Date.now();
    pruneHandledActions(handledAt, now);
    const actionKey = `${action.watchId}\0${action.action}`;
    const previousHandledAt = handledAt.get(actionKey);

    if (previousHandledAt !== undefined && now - previousHandledAt < duplicateActionWindowMs) {
      return;
    }

    handledAt.set(actionKey, now);

    try {
      const watch = deps.controller.getWatches().find((item) => item.id === action.watchId);

      if (!watch) {
        if (action.action === "open" && action.url && isVerifiedGitHubNotificationUrl(action.url)) {
          await deps.openUrl(action.url);
        }

        return;
      }

      deps.controller.markSeen(watch.id);

      if (action.action === "open") {
        if (isVerifiedGitHubNotificationUrl(watch.target.url)) {
          await deps.openUrl(watch.target.url);
        } else {
          deps.reportError("The notification URL is no longer valid.");
        }

        return;
      }

      if (action.action === "save" || action.action === "done") {
        const nextState = action.action === "save" ? "saved" : "done";

        if (getWatchTriageState(watch) !== nextState) {
          deps.controller.setTriageState([watch.id], nextState);
          deps.queueSync();
        }

        return;
      }

      if (!canRerunFailed(watch)) {
        deps.controller.setWatchError(watch.id, staleRerunMessage);
        deps.reportError(staleRerunMessage);
        await refreshStaleWatch(deps, watch);
        return;
      }

      const wasSynced = getWatchTriageState(watch) !== "inbox";

      try {
        await deps.controller.rerun(watch.id, "failed");

        if (wasSynced) {
          deps.queueSync();
        }

        deps.refreshAfterRerun(watch.id);
      } catch (error) {
        const message = "Could not re-run failed GitHub Actions jobs.";
        deps.controller.setWatchError(watch.id, message);
        deps.reportError(message, error);
        await refreshStaleWatch(deps, watch);
      }
    } finally {
      await deps.clearNotifications();
    }
  };
}

function pruneHandledActions(handledAt: Map<string, number>, now: number): void {
  for (const [actionKey, timestamp] of handledAt) {
    if (now - timestamp >= duplicateActionWindowMs || now < timestamp) {
      handledAt.delete(actionKey);
    }
  }
}

export function createDesktopNotificationActionQueue(
  onError: (error: unknown) => void,
): DesktopNotificationActionQueue {
  let handler: ((action: DesktopNotificationAction) => Promise<void>) | undefined;
  let pending: DesktopNotificationAction[] = [];
  let processing = Promise.resolve();

  function enqueue(action: DesktopNotificationAction): void {
    processing = processing
      .then(async () => handler?.(action))
      .catch(onError);
  }

  return {
    receive(action) {
      if (!handler) {
        pending.push(action);
        return;
      }

      enqueue(action);
    },

    async start(nextHandler) {
      if (handler) {
        return;
      }

      handler = nextHandler;
      const startupActions = pending;
      pending = [];

      for (const action of startupActions) {
        enqueue(action);
      }

      await processing;
    },

    whenIdle() {
      return processing;
    },
  };
}

async function refreshStaleWatch(
  deps: DesktopNotificationActionHandlerDeps,
  watch: WatchRecord,
): Promise<void> {
  try {
    await deps.refreshStaleWatch(watch);
  } catch (error) {
    deps.reportError("Could not refresh the GitHub Actions state.", error);
  }
}
