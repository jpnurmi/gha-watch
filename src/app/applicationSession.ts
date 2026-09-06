import type { AppSettings } from "../domain/settings";
import type { SyncedState } from "../platform/settingsGist";
import type { SettingsSync } from "./settingsSync";
import { createRefreshCoordinator } from "./refreshCoordinator";

export function createApplicationSession<View>(deps: {
  sync: SettingsSync;
  enabled: boolean;
  getState(): SyncedState;
  applySettings(settings: AppSettings): Promise<void>;
  applyWatches(state: SyncedState): void;
  onSynced(): void;
  reportError(message: string, error: unknown): void;
  poll(view?: View): Promise<void>;
  onRefreshingChanged(refreshing: boolean): void;
  onSettled(): void;
}) {
  let revision = 0;
  const refresh = createRefreshCoordinator<View>({
    onRefreshingChanged: deps.onRefreshingChanged,
    onSettled: deps.onSettled,
    async run(view) {
      await sync();
      await deps.poll(view);
    },
  });

  function upload(): void {
    if (!deps.enabled) return;
    void deps.sync.push(deps.getState()).catch((error) => {
      deps.reportError("Could not upload synced state.", error);
    });
  }

  async function sync(): Promise<void> {
    if (!deps.enabled) return;
    const started = revision;
    try {
      const state = await deps.sync.sync(deps.getState());
      if (revision !== started) return;
      if (JSON.stringify(state.settings) !== JSON.stringify(deps.getState().settings)) {
        await deps.applySettings(state.settings);
        if (revision !== started) return;
      }
      deps.applyWatches(state);
      deps.sync.acknowledge(deps.getState());
      deps.onSynced();
    } catch (error) {
      deps.reportError("Could not sync state.", error);
    }
  }

  return {
    refresh: refresh.refresh,
    async updateSettings(settings: AppSettings, syncRemote: boolean) {
      if (syncRemote) revision++;
      await deps.applySettings(settings);
      if (syncRemote) upload();
    },
    changed() {
      revision++;
      upload();
    },
  };
}
