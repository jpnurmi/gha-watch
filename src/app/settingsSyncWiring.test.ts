import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

describe("settings sync wiring", () => {
  it("syncs settings before startup and manual status refreshes", () => {
    expect(mainSource).toContain("void refreshSettingsAndStatuses();");
    expect(mainSource).toMatch(
      /data-action="refresh"[\s\S]*?void refreshSettingsAndStatuses\(true\);/,
    );
    expect(mainSource).toMatch(
      /async function refreshSettingsAndStatuses[\s\S]*?await syncSettingsFromGist\(\);[\s\S]*?await poll\(forceVisibleData\);/,
    );
  });

  it("uploads explicit settings and triage changes", () => {
    expect(mainSource).toContain("updateAppSettings({ ...settings, repoOrder }, true)");
    expect(mainSource).toContain("updateAppSettings({ ...settings, watchedRepos }, true)");
    expect(mainSource).toContain("updateAppSettings({ ...settings, watchedRepos }, false)");
    expect(mainSource).toMatch(
      /controller\.setTriageState\([\s\S]*?queueSyncedStateUpload\(\);/,
    );
    expect(mainSource).toMatch(
      /controller\.clearDone\([\s\S]*?queueSyncedStateUpload\(\);/,
    );
    expect(mainSource).toContain("controller.replaceSyncedWatches(syncedState.watches)");
  });
});
