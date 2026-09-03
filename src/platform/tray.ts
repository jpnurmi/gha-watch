import { invoke } from "@tauri-apps/api/core";
import type { TrayStatus } from "../app/trayState";

let pendingUpdate = Promise.resolve();

export function setTrayIndicator(
  status: TrayStatus,
  tooltip: string,
  hasUnseenChanges: boolean,
): Promise<void> {
  const update = pendingUpdate.then(async () => {
    try {
      await invoke("set_tray_indicator", { status, tooltip, hasUnseenChanges });
    } catch (error) {
      console.warn("Unable to update tray indicator", error);
    }
  });

  pendingUpdate = update;
  return update;
}
