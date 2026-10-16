import { invoke } from "@tauri-apps/api/core";
import type { TrayStatus } from "../app/trayState";
import type { WatchNotification } from "../app/watchNotification";

type Commands = {
  get_build_sha: { args: undefined; result: string };
  set_tray_indicator: { args: { status: TrayStatus; tooltip: string; hasUnseenChanges: boolean }; result: void };
  show_desktop_notification: { args: { notification: WatchNotification }; result: void };
  clear_desktop_notifications: { args: undefined; result: void };
  open_github_url: { args: { url: string }; result: void };
};

export function invokeDesktop<K extends keyof Commands>(
  command: K,
  ...args: Commands[K]["args"] extends undefined ? [] : [Commands[K]["args"]]
): Promise<Commands[K]["result"]> {
  return args.length ? invoke(command, args[0]) : invoke(command);
}
