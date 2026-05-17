import { describe, expect, it } from "vitest";
import { getWatchSubjectIconSvg } from "./watchSubjectIcon";
import type { WatchSubject } from "./viewModel";

type WatchSubjectIconSubject = Exclude<WatchSubject, "pull-request">;

describe("getWatchSubjectIconSvg", () => {
  it.each(["workflow", "job"] as WatchSubjectIconSubject[])("renders a %s subject icon", (subject) => {
    const svg = getWatchSubjectIconSvg(subject);

    expect(svg).toContain("<svg");
    expect(svg).toContain("currentColor");
  });

  it("uses distinct workflow and job icon paths", () => {
    expect(getWatchSubjectIconSvg("workflow")).not.toBe(getWatchSubjectIconSvg("job"));
  });
});
