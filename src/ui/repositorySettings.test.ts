// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createPopupViewModel } from "../app/viewModel";
import { fitWorkflowTargetSummaries, renderRepositorySettings } from "./repositorySettings";

const repo = { owner: "owner", repo: "repo" };
const group = createPopupViewModel([], new Date(), [repo]).groups[0];

function render(names: string[], selectedTargetKey: string | null = "default"): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = renderRepositorySettings(group, {
    currentWatchView: "inbox",
    renderRepoIcon: () => "icon",
    watchedRepos: [{
      ...repo,
      workflowTargets: [
        { kind: "default", workflowNames: names },
        { kind: "include", pattern: "release/*", workflowNames: ["CI"] },
      ],
    }],
    repositoryWatchMenu: {
      ...repo, repoKey: "owner/repo", status: "loaded", defaultBranch: "main", userLogin: "user",
      workflows: names.map((name) => ({ name, path: "" })), selectedTargetKey,
    },
  });
  return root;
}

describe("workflow rule summaries", () => {
  it("keeps workflow choices inside the expanded rule", () => {
    const root = render(["CI"]);
    const rows = root.querySelectorAll(".workflow-target-row");

    expect(rows[0].querySelector('.workflow-target-select')?.getAttribute("aria-expanded")).toBe("true");
    expect(rows[0].querySelector('.workflow-target-workflows [data-workflow="CI"]')).not.toBeNull();
    expect(rows[1].querySelector(".workflow-target-workflows")).toBeNull();
    expect(render(["CI"], null).querySelector(".workflow-target-workflows")).toBeNull();
  });

  it("shows up to two workflow names and summarizes larger selections with a count", () => {
    for (const names of [["CI"], ["CI", "CodeQL"], ["CI", "CodeQL", "Release"]]) {
      const summary = render(names).querySelector(".workflow-target-summary")!;
      const chips = summary.querySelectorAll(".workflow-target-names .watch-branch-badge");
      const count = summary.querySelector(".workflow-target-count")!;

      expect([...chips].map((chip) => chip.textContent)).toEqual(names.length <= 2 ? names : []);
      expect(count.textContent).toBe(String(names.length));
      expect(count.getAttribute("title")).toBe(names.join(", "));
      expect(count.getAttribute("aria-label")).toBe(`${names.length} ${names.length === 1 ? "workflow" : "workflows"}`);
    }
  });

  it("switches to a count when names do not fit and restores them when space returns", () => {
    const root = render(["CI", "CodeQL"]);
    const summary = root.querySelector<HTMLElement>(".workflow-target-summary")!;
    const names = summary.querySelector<HTMLElement>(".workflow-target-names")!;
    Object.defineProperty(names, "scrollWidth", { value: 90 });

    for (const [width, collapsed] of [[100, false], [80, true], [90, false]] as const) {
      Object.defineProperty(summary, "clientWidth", { value: width, configurable: true });
      fitWorkflowTargetSummaries(root);
      expect(summary.classList.contains("is-collapsed")).toBe(collapsed);
    }
  });

  it("escapes workflow names in badges and count tooltips", () => {
    const names = ['<CI> "build"', "CodeQL & tests", "Release"];
    const summary = render(names).querySelector(".workflow-target-summary")!;

    expect(summary.querySelector("ci")).toBeNull();
    expect(summary.querySelector(".workflow-target-count")?.getAttribute("title")).toBe(names.join(", "));
  });
});
