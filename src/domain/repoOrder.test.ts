import { describe, expect, it } from "vitest";
import { getRepoDropPosition, getRepoDropTarget, moveRepoKey, normalizeRepoOrder } from "./repoOrder";

describe("repo ordering", () => {
  it("normalizes saved repo order and removes invalid or duplicate keys", () => {
    expect(
      normalizeRepoOrder([
        "getsentry/sentry",
        "getsentry/sentry",
        "jpnurmi/gha-watch",
        "missing-owner",
        "/missing-owner",
        "missing-repo/",
        null,
      ]),
    ).toEqual(["getsentry/sentry", "jpnurmi/gha-watch"]);
  });

  it("moves a visible repo before a target repo", () => {
    expect(
      moveRepoKey(
        ["getsentry/sentry", "jpnurmi/gha-watch", "getsentry/sentry-javascript"],
        "getsentry/sentry-javascript",
        "getsentry/sentry",
        "before",
      ),
    ).toEqual(["getsentry/sentry-javascript", "getsentry/sentry", "jpnurmi/gha-watch"]);
  });

  it("moves a visible repo after a target repo", () => {
    expect(
      moveRepoKey(
        ["getsentry/sentry", "jpnurmi/gha-watch", "getsentry/sentry-javascript"],
        "getsentry/sentry",
        "getsentry/sentry-javascript",
        "after",
      ),
    ).toEqual(["jpnurmi/gha-watch", "getsentry/sentry-javascript", "getsentry/sentry"]);
  });

  it("leaves order unchanged for missing or identical move targets", () => {
    const repoOrder = ["getsentry/sentry", "jpnurmi/gha-watch"];

    expect(moveRepoKey(repoOrder, "getsentry/sentry", "getsentry/sentry", "before")).toBe(repoOrder);
    expect(moveRepoKey(repoOrder, "getsentry/sentry", "unknown/repo", "before")).toBe(repoOrder);
    expect(moveRepoKey(repoOrder, "unknown/repo", "getsentry/sentry", "before")).toBe(repoOrder);
  });

  it("uses the target midpoint to choose before or after drop placement", () => {
    expect(getRepoDropPosition({ clientY: 119, top: 100, height: 40 })).toBe("before");
    expect(getRepoDropPosition({ clientY: 120, top: 100, height: 40 })).toBe("after");
  });

  it("finds a valid drop target from pointer position while ignoring the dragged repo", () => {
    const targets = [
      { key: "getsentry/sentry", top: 100, height: 40 },
      { key: "jpnurmi/gha-watch", top: 140, height: 40 },
      { key: "getsentry/sentry-javascript", top: 180, height: 40 },
    ];

    expect(getRepoDropTarget(targets, "getsentry/sentry", 152)).toEqual({
      targetKey: "jpnurmi/gha-watch",
      position: "before",
    });
    expect(getRepoDropTarget(targets, "getsentry/sentry", 205)).toEqual({
      targetKey: "getsentry/sentry-javascript",
      position: "after",
    });
    expect(getRepoDropTarget(targets, "getsentry/sentry", 120)).toBeUndefined();
    expect(getRepoDropTarget(targets, "getsentry/sentry", 260)).toBeUndefined();
  });
});
