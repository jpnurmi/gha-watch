import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

describe("settings sync wiring", () => {
  it("syncs settings before startup and manual status refreshes", () => {
    expect(mainSource).toContain("void refreshSettingsAndStatuses();");
    expect(mainSource).toMatch(
      /data-action="refresh"[\s\S]*?void refreshSettingsAndStatuses\(currentWatchView\);/,
    );
    expect(mainSource).toMatch(
      /createRefreshCoordinator<WatchTriageState>\(\{[\s\S]*?async run\(view\) \{\s*await syncSettingsFromGist\(\);\s*await poll\(view\);/,
    );
    expect(mainSource).toMatch(
      /createAdaptivePollingCoordinator\(\{[\s\S]*?poll: \(mode\) => \{\s*void refreshSettingsAndStatuses\(mode === "full" \? currentWatchView : undefined\);/,
    );
    expect(mainSource).toMatch(
      /controller\.replaceSyncedWatches\(\s*syncedState\.watches,\s*syncedState\.watchSuppressions,\s*\);\s*settingsSync\.acknowledge\(getLocalSyncedState\(\)\)/,
    );
    expect(mainSource).toMatch(
      /await updateAppSettings\(syncedState\.settings, false\);\s*if \(syncedStateRevision !== revision\) \{\s*return;\s*\}[\s\S]*?controller\.replaceSyncedWatches/,
    );
  });

  it("preserves the selected view when a manual refresh is queued", () => {
    expect(mainSource).toContain("await refreshCoordinator.refresh(manualRefreshView)");
    expect(mainSource).toContain('const watchView = manualRefreshView ?? "inbox"');
  });

  it("fully refreshes the selected view on a full adaptive poll", () => {
    expect(mainSource).toContain('mode === "full" ? currentWatchView : undefined');
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
    expect(mainSource).toMatch(
      /controller\.replaceSyncedWatches\(\s*syncedState\.watches,\s*syncedState\.watchSuppressions,/,
    );
    expect(mainSource).toContain("watchSuppressions: controller.getWatchSuppressions()");
  });
});
