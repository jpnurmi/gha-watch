import {
  disable,
  enable,
  isEnabled,
} from "@tauri-apps/plugin-autostart";

export type AutoStartDeps = {
  enable(): Promise<void>;
  disable(): Promise<void>;
  isEnabled(): Promise<boolean>;
};

const autoStartDeps: AutoStartDeps = {
  enable,
  disable,
  isEnabled,
};

export function getAutoStartEnabled(deps: AutoStartDeps = autoStartDeps): Promise<boolean> {
  return deps.isEnabled();
}

export async function setAutoStartEnabled(
  enabled: boolean,
  deps: AutoStartDeps = autoStartDeps,
): Promise<boolean> {
  if (enabled) {
    await deps.enable();
  } else {
    await deps.disable();
  }

  return deps.isEnabled();
}
