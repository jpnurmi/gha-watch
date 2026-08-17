import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RepoCiStatusViewModel } from "./viewModel";
import {
  getRepoCiStatusAfterRefreshError,
  repoCiRefreshIntervalMs,
  shouldRefreshRepoCiStatus,
} from "./repoCiRefresh";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");

describe("shouldRefreshRepoCiStatus", () => {
  it("skips background refreshes while the popup is closed", () => {
    expect(
      shouldRefreshRepoCiStatus({
        force: false,
        now: repoCiRefreshIntervalMs,
        popupOpen: false,
      }),
    ).toBe(false);
  });

  it("refreshes missing or stale visible statuses", () => {
    expect(
      shouldRefreshRepoCiStatus({
        force: false,
        now: repoCiRefreshIntervalMs,
        popupOpen: true,
      }),
    ).toBe(true);
    expect(
      shouldRefreshRepoCiStatus({
        force: false,
        lastUpdatedAt: 1,
        now: repoCiRefreshIntervalMs + 1,
        popupOpen: true,
      }),
    ).toBe(true);
  });

  it("throttles recent visible statuses", () => {
    expect(
      shouldRefreshRepoCiStatus({
        force: false,
        lastUpdatedAt: 1,
        now: repoCiRefreshIntervalMs,
        popupOpen: true,
      }),
    ).toBe(false);
  });

  it("always honors a forced refresh", () => {
    expect(
      shouldRefreshRepoCiStatus({
        force: true,
        lastUpdatedAt: repoCiRefreshIntervalMs,
        now: repoCiRefreshIntervalMs,
        popupOpen: false,
      }),
    ).toBe(true);
  });

  it("wires visible, manual, and cached default-branch refreshes", () => {
    expect(mainSource).toContain("void refreshListedRepositoryCiStatuses();");
    expect(mainSource).toContain("void refreshSettingsAndStatuses(true);");
    expect(mainSource).toContain("popupOpen: isPopupOpen");
    expect(mainSource).toContain("getCachedRepositoryDefaultBranch(repo, force)");
  });
});

describe("getRepoCiStatusAfterRefreshError", () => {
  it("keeps the last known status after a transient refresh failure", () => {
    const previousStatus: RepoCiStatusViewModel = {
      tone: "success",
      label: "Passing",
      description: "main: 1 workflow passed",
      defaultBranch: "main",
      commitSha: "abc123",
      workflows: [
        {
          tone: "success",
          label: "Passing",
          description: "CI passed",
          name: "CI",
          url: "https://github.com/jpnurmi/gha-watch/actions/runs/1",
        },
      ],
    };

    expect(getRepoCiStatusAfterRefreshError(previousStatus)).toBe(previousStatus);
  });

  it("keeps the status hidden when the initial refresh fails", () => {
    expect(getRepoCiStatusAfterRefreshError(undefined)).toBeUndefined();
  });

  it("does not publish a placeholder while the initial status is loading", () => {
    expect(mainSource).not.toContain('label: "Loading"');
    expect(mainSource).not.toContain('description: "Loading default branch CI status"');
  });
});
