import type { SettingsSyncJournal } from "../app/settingsSync";
import { parseSettingsDocument, serializeSettingsDocument } from "./settingsGist";

const storageKey = "gha-watch:pending-sync";

export function createSettingsJournal(): SettingsSyncJournal {
  return {
    load() {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return undefined;
      const document = JSON.parse(raw);
      if (document === null) return undefined;
      if (document.version !== 1 || typeof document.pending !== "string") {
        throw new Error("Unsupported pending sync document.");
      }
      return {
        pending: parseSettingsDocument(document.pending),
        ...(typeof document.baseline === "string" ? { baseline: parseSettingsDocument(document.baseline) } : {}),
      };
    },
    save(state) {
      localStorage.setItem(storageKey, JSON.stringify(state ? {
        version: 1,
        pending: serializeSettingsDocument(state.pending),
        ...(state.baseline ? { baseline: serializeSettingsDocument(state.baseline) } : {}),
      } : null));
    },
  };
}
