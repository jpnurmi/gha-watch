import { invoke } from "@tauri-apps/api/core";
import type { TrayStatus } from "../app/trayState";

export async function setTrayIndicator(status: TrayStatus, tooltip: string): Promise<void> {
  try {
    await invoke("set_tray_indicator", { status, tooltip });
  } catch (error) {
    console.warn("Unable to update tray indicator", error);
  }
}
