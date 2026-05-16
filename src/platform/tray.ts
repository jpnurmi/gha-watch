import { invoke } from "@tauri-apps/api/core";

export async function setTrayIndicator(indicator: string, tooltip: string): Promise<void> {
  try {
    await invoke("set_tray_indicator", { indicator, tooltip });
  } catch (error) {
    console.warn("Unable to update tray indicator", error);
  }
}
