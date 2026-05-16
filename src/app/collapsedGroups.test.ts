import { describe, expect, it } from "vitest";
import { createCollapsedGroups } from "./collapsedGroups";

describe("createCollapsedGroups", () => {
  it("toggles collapsed state by repository label", () => {
    const collapsedGroups = createCollapsedGroups();

    expect(collapsedGroups.has("getsentry/sentry")).toBe(false);

    collapsedGroups.toggle("getsentry/sentry");

    expect(collapsedGroups.has("getsentry/sentry")).toBe(true);
    expect(collapsedGroups.has("jpnurmi/sentry-qml")).toBe(false);

    collapsedGroups.toggle("getsentry/sentry");

    expect(collapsedGroups.has("getsentry/sentry")).toBe(false);
  });
});
