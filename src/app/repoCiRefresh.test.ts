import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { repoCiRefreshIntervalMs, shouldRefreshRepoCiStatus } from "./repoCiRefresh";

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
    expect(mainSource).toContain("void poll(true);");
    expect(mainSource).toContain("popupOpen: isPopupOpen");
    expect(mainSource).toContain("getCachedRepositoryDefaultBranch(repo, force)");
  });
});
