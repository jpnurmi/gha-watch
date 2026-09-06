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
    expect(html).toContain('data-triage-state="saved"');
    expect(html).toContain('data-triage-state="done"');
    expect(html).not.toContain('watch-rerun-popover');
  });

  it("opens rerun choices only for the selected row", () => {
    expect(renderWatch(row, { id: row.id, kind: "rerun" })).toContain('data-action="rerun-failed"');
    expect(renderWatch(row, { id: "other", kind: "rerun" })).not.toContain('data-action="rerun-failed"');
  });

  it("shows removal only in Done and preserves the PR lifecycle icon", () => {
    expect(renderWatch({ ...row, triageState: "done" })).toContain('title="Remove from Done"');
    expect(renderWatch(row)).not.toContain('data-action="clear-done-watch"');
    expect(renderWatch({ ...row, subject: "pull-request", prState: { label: "Merged", tone: "merged" } }))
      .toContain('pr-state-icon-merged');
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
      repositoryWatchMenu: { repoKey: "owner/repo", status: "loaded", defaultBranch: "main", userLogin: "user", workflows: [] },
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
});
