import { describe, expect, it } from "vitest";
import { createPopupViewModel } from "../app/viewModel";
import type { WatchRecord } from "../domain/watches";
import { renderWatch } from "./watchRow";
import { renderRepositorySettings } from "./repositorySettings";
import { renderAddForm } from "./addPanel";

const watch: WatchRecord = {
  id: "owner/repo/run/1",
  target: { kind: "run", owner: "owner", repo: "repo", runId: "1", url: "https://github.com/owner/repo/actions/runs/1" },
  label: '<CI> "tests"', status: "completed:failure", active: true,
  lastState: { status: "completed", conclusion: "failure" }, error: undefined,
};
const row = createPopupViewModel([watch]).groups[0].rows[0];
const group = createPopupViewModel([], new Date(), [{ owner: "owner", repo: "repo" }]).groups[0];

describe("UI regions", () => {
  it("escapes watch labels and exposes explicit links and triage actions", () => {
    const html = renderWatch(row);
    expect(html).not.toContain('<CI>');
    expect(html).toContain('&lt;CI&gt;');
    expect(html).toContain('data-action="open-github-url"');
    expect(html).not.toContain('data-triage-state="saved"');
    expect(html).toContain('data-triage-state="done"');
    expect(html).not.toContain('watch-menu-popover');
  });

  it("opens actions only for the selected row", () => {
    expect(renderWatch(row, row.id)).toContain('data-action="rerun-failed"');
    expect(renderWatch(row, "other")).not.toContain('data-action="rerun-failed"');
  });

  it("highlights unseen changes on the title and leading dot", () => {
    const html = renderWatch({ ...row, unseenStatusChange: true });

    expect(html).toContain("has-unseen-change");
    expect(html).toContain("unseen-dot");
    expect(html).toContain("watch-leading-seen-button");
  });

  it("shows removal only in Done and preserves the PR lifecycle icon", () => {
    expect(renderWatch({ ...row, triageState: "done" }, row.id)).toContain('data-action="clear-done-watch"');
    expect(renderWatch(row)).not.toContain('data-action="clear-done-watch"');
    expect(renderWatch({ ...row, subject: "pull-request", prState: { label: "Merged", tone: "merged" } }))
      .toContain('pr-state-icon-merged');
  });

  it("shows stack position after the PR number, including when checks fail to load", () => {
    const pr = {
      ...watch,
      target: { kind: "pr" as const, owner: "owner", repo: "repo", prNumber: "1", url: "https://github.com/owner/repo/pull/1" },
      metadata: { prStack: { number: 42, position: 2, size: 5 } },
    };
    for (const error of [undefined, "Could not load checks"]) {
      const html = renderWatch(createPopupViewModel([{ ...pr, error }]).rows[0]);
      expect(html).toContain('class="watch-stack"');
      expect(html).toContain('title="PR 2 of 5 in stack #42"');
      expect(html).toContain('aria-label="PR 2 of 5 in stack #42"');
      expect(html).toContain('>2/5</span>');
      expect(html.indexOf('class="watch-stack"')).toBeGreaterThan(html.indexOf('class="watch-title-reference"'));
      expect(html.indexOf('class="watch-stack"')).toBeLessThan(html.indexOf('class="watch-meta"'));
    }
    expect(renderWatch(row)).not.toContain('class="watch-stack"');
    expect(renderWatch(createPopupViewModel([{ ...watch, metadata: pr.metadata }]).rows[0]))
      .not.toContain('class="watch-stack"');
  });

  it("keeps repository settings out of saved history", () => {
    const html = renderRepositorySettings(group, { currentWatchView: "saved", watchedRepos: [], renderRepoIcon: () => "icon" });
    expect(html).toContain('watch-group-watch is-static');
    expect(html).not.toContain('data-action="toggle-repository-watches"');
  });

  it("keeps selected workflows available after their definitions disappear", () => {
    const html = renderRepositorySettings(group, {
      currentWatchView: "inbox", renderRepoIcon: () => "icon",
      watchedRepos: [{ owner: "owner", repo: "repo", workflowTargets: [{ kind: "all", workflowNames: ["Old CI"] }] }],
      repositoryWatchMenu: { repoKey: "owner/repo", owner: "owner", repo: "repo", status: "loaded", defaultBranch: "main", userLogin: "user", workflows: [] },
    });
    expect(html).toContain('data-workflow="Old CI"');
    expect(html).toContain('aria-checked="true"');
  });

  it("renders discovery failure and manual input together", () => {
    const html = renderAddForm({ status: "error", error: '<unavailable>' }, [], 'Invalid "URL"');
    expect(html).toContain('data-action="retry-pr-discovery"');
    expect(html).toContain('&lt;unavailable&gt;');
    expect(html).toContain('name="url"');
    expect(html).toContain('Invalid &quot;URL&quot;');
  });

  it.each(["include", "exclude"] as const)("marks an empty %s rule inactive until a workflow is selected", (kind) => {
    const props = {
      currentWatchView: "inbox" as const,
      renderRepoIcon: () => "icon",
      watchedRepos: [{
        owner: "owner", repo: "repo",
        workflowTargets: [{ kind, pattern: "release/*", workflowNames: [] as string[] }],
      }],
      repositoryWatchMenu: {
        repoKey: "owner/repo", owner: "owner", repo: "repo", status: "loaded" as const,
        defaultBranch: "main", userLogin: "user",
        workflows: [{ name: "CI", path: ".github/workflows/ci.yml", state: "active" }],
      },
    };

    const inactive = renderRepositorySettings(group, props);
    expect(inactive).toContain('>No workflows</span>');
    expect(inactive).toContain('Select at least one workflow to activate this rule.');
    expect(inactive).toContain('aria-checked="false"');

    props.watchedRepos[0].workflowTargets[0].workflowNames = ["CI"];
    const active = renderRepositorySettings(group, props);
    expect(active).not.toContain('>No workflows</span>');
    expect(active).toContain('class="watch-branch-badge workflow-target-chip" title="CI">CI</span>');
    expect(active).not.toContain('Select at least one workflow to activate this rule.');
    expect(active).toContain('aria-checked="true"');
  });

  it.each(["default", "own", "all", "include", "exclude"] as const)("requires confirming workflows for a new %s rule", (kind) => {
    const draft = { kind, workflowNames: ["CI"] };
    const props = {
      currentWatchView: "inbox" as const,
      renderRepoIcon: () => "icon",
      watchedRepos: [{
        owner: "owner", repo: "repo",
        workflowTargets: [{ kind: "default" as const, workflowNames: ["CI"] }],
      }],
      repositoryWatchMenu: {
        repoKey: "owner/repo", owner: "owner", repo: "repo", status: "loaded" as const,
        defaultBranch: "main", userLogin: "user", targetEditor: draft,
        workflows: [{ name: "CI", path: ".github/workflows/ci.yml", state: "active" }],
      },
    };

    const selected = renderRepositorySettings(group, props);
    expect(selected).toContain('data-action="save-workflow-target"');
    expect(selected).toContain('data-action="toggle-draft-workflow"');
    expect(selected).not.toContain('data-action="toggle-workflow-subscription"');
    expect(selected).toContain('aria-checked="true"');
    expect(selected).toContain('>Save rule</button>');
    expect(selected).toContain('>Cancel</button>');
    expect(selected.includes('name="pattern"')).toBe(kind === "include" || kind === "exclude");

    draft.workflowNames = [];
    const empty = renderRepositorySettings(group, props);
    expect(empty).toContain('disabled>Save rule</button>');
    expect(empty).toContain('aria-checked="false"');
  });

  it("escapes notes in both the row and its editor", () => {
    const noted = { ...row, note: '</textarea><script>"reminder"</script>' };
    for (const html of [renderWatch(noted), renderWatch(noted, undefined, row.id)]) {
      expect(html).toContain('&lt;/textarea&gt;&lt;script&gt;&quot;reminder&quot;&lt;/script&gt;');
      expect(html).not.toContain('<script>');
    }
    expect(renderWatch(noted, row.id)).toContain('>Edit note…</span>');
    expect(renderWatch(noted, undefined, row.id)).toContain('data-action="remove-note"');
  });

  it("opens a note editor only for the selected item", () => {
    expect(renderWatch(row, row.id)).toContain('>Add note…</span>');
    expect(renderWatch(row, undefined, row.id)).toContain('<textarea name="note"');
    expect(renderWatch(row, undefined, "other")).not.toContain('<textarea');
    expect(renderWatch(row, undefined, row.id)).not.toContain('data-action="remove-note"');
  });
});
