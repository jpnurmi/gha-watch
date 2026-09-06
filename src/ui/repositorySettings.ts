import type { WatchGroupViewModel } from "../app/viewModel";
import type { WorkflowDefinition } from "../app/githubPort";
import type { WatchTriageState } from "../domain/watches";
import { getWatchedRepoKey, getWatchedPullRequestScope, getWatchedWorkflowTargetKey,
  type WatchedRepo, type WatchedPullRequestScope, type WatchedWorkflowTarget, type WatchedWorkflowTargetKind } from "../domain/watchedRepos";
import { renderDragGripIcon } from "../app/dragGlyph";
import { escapeHtml } from "./markup";

export type RepositoryWatchMenuState =
  | {
      repoKey: string;
      status: "loading";
      userLogin?: string;
    }
  | {
      repoKey: string;
      status: "loaded";
      defaultBranch: string;
      userLogin: string;
      workflows: WorkflowDefinition[];
      selectedTargetKey?: string;
      targetEditor?: "menu" | "include" | "exclude";
    }
  | {
      repoKey: string;
      status: "error";
      error: string;
      userLogin?: string;
    };

export function renderRepositorySettings(
  group: WatchGroupViewModel,
  props: {
    currentWatchView: WatchTriageState;
    repositoryWatchMenu?: RepositoryWatchMenuState;
    watchedRepos: WatchedRepo[];
    renderRepoIcon(group: WatchGroupViewModel): string;
  },
): string {
  const { currentWatchView, repositoryWatchMenu, watchedRepos, renderRepoIcon } = props;
  function findWatchedRepo(repo: Pick<WatchedRepo, "owner" | "repo">): WatchedRepo | undefined {
    return watchedRepos.find((watchedRepo) => getWatchedRepoKey(watchedRepo) === getWatchedRepoKey(repo));
  }

function renderRepositoryWatchMenu(group: WatchGroupViewModel): string {
  if (currentWatchView !== "inbox") {
    return `
      <span class="watch-group-watch is-static" aria-hidden="true">
        <span class="watch-group-icon">
          ${renderRepoIcon(group)}
        </span>
        <span class="watch-group-drag-glyph">
          ${renderDragGripIcon()}
        </span>
      </span>
    `;
  }

  const repoKey = getWatchedRepoKey(group);
  const menuState = repositoryWatchMenu?.repoKey === repoKey ? repositoryWatchMenu : undefined;

  return `
    <div class="repo-action-menu watch-group-watch-menu">
      <button
        class="watch-group-watch${group.watched ? " is-watched" : ""}"
        type="button"
        data-action="toggle-repository-watches"
        data-owner="${escapeHtml(group.owner)}"
        data-repo="${escapeHtml(group.repo)}"
        title="Watches"
        aria-label="Watches for ${escapeHtml(group.repoLabel)}"
        aria-haspopup="menu"
        aria-expanded="${menuState ? "true" : "false"}"
      >
        <span class="watch-group-icon" aria-hidden="true">
          ${renderRepoIcon(group)}
        </span>
        <span class="watch-group-watch-glyph" aria-hidden="true">
          ${renderEyeIcon(group.watched)}
        </span>
        <span class="watch-group-drag-glyph" aria-hidden="true">
          ${renderDragGripIcon()}
        </span>
      </button>
      ${menuState ? renderRepositoryWatchPopover(group, menuState) : ""}
    </div>
  `;
}

function renderEyeIcon(watched: boolean): string {
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.5 8s2.3-3.75 6.5-3.75S14.5 8 14.5 8 12.2 11.75 8 11.75 1.5 8 1.5 8Z"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.4"
      />
      <circle cx="8" cy="8" r="1.9" fill="${watched ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.2"/>
    </svg>
  `;
}

function renderRepositoryWatchPopover(
  group: WatchGroupViewModel,
  menuState: RepositoryWatchMenuState,
): string {
  let workflowContent: string;

  if (menuState.status === "loading") {
    workflowContent = `<div class="repo-action-status">Loading workflows...</div>`;
  } else if (menuState.status === "error") {
    workflowContent = `<div class="repo-action-status is-error">${escapeHtml(menuState.error)}</div>`;
  } else {
    const workflows = getWorkflowSubscriptionMenuWorkflows(group, menuState.workflows);
    workflowContent = workflows.length > 0
      ? renderWorkflowTargetingEditor(group, menuState, workflows)
      : `<div class="repo-action-status">No workflows</div>`;
  }

  return `
    <div class="repo-action-popover repository-watch-popover" role="menu">
      ${renderPullRequestWatchItem(group, menuState.userLogin)}
      ${workflowContent}
    </div>
  `;
}

function renderPullRequestWatchItem(group: WatchGroupViewModel, userLogin: string | undefined): string {
  const watchedRepo = findWatchedRepo(group);
  const selectedScope = watchedRepo ? getWatchedPullRequestScope(watchedRepo) : undefined;
  const displayLabel = userLogin?.trim() || "…";

  return `
    <div class="repository-watch-item pull-request-watch-item" role="none">
      <span class="repo-action-title">Pull requests</span>
      <span class="repository-watch-segmented" role="group" aria-label="Pull request watches">
        ${renderPullRequestWatchScope(group, "all", "all", selectedScope)}
        ${renderPullRequestWatchScope(group, "user", displayLabel, selectedScope)}
      </span>
    </div>
  `;
}

function renderPullRequestWatchScope(
  group: WatchGroupViewModel,
  scope: WatchedPullRequestScope,
  displayLabel: string,
  selectedScope: WatchedPullRequestScope | undefined,
): string {
  const checked = scope === selectedScope;
  const subject = scope === "all" ? "all pull requests" : `pull requests by ${displayLabel}`;

  return `
    <button
      class="repository-watch-segment repository-watch-segment-${scope}${checked ? " is-selected" : ""}"
      type="button"
      role="menuitemcheckbox"
      aria-checked="${checked ? "true" : "false"}"
      data-action="toggle-watched-pull-request-scope"
      data-owner="${escapeHtml(group.owner)}"
      data-repo="${escapeHtml(group.repo)}"
      data-scope="${scope}"
      title="${checked ? "Stop watching" : "Watch"} ${escapeHtml(subject)}"
      aria-label="${checked ? "Stop watching" : "Watch"} ${escapeHtml(subject)} in ${escapeHtml(group.repoLabel)}"
    >
      ${escapeHtml(displayLabel)}
    </button>
  `;
}

function renderWorkflowTargetingEditor(
  group: WatchGroupViewModel,
  menuState: Extract<RepositoryWatchMenuState, { status: "loaded" }>,
  workflows: WorkflowDefinition[],
): string {
  const targets = findWatchedRepo(group)?.workflowTargets ?? [];
  const selectedTargetKey = getSelectedWorkflowTargetKey(menuState, targets);
  const selectedTarget = targets.find(
    (target) => getWatchedWorkflowTargetKey(target) === selectedTargetKey,
  );

  return `
    <section class="workflow-targeting" aria-label="Workflow branches">
      <div class="workflow-targeting-header">
        <span class="repo-action-title">Branches</span>
        <button
          class="workflow-target-add"
          type="button"
          data-action="toggle-workflow-target-editor"
          aria-expanded="${menuState.targetEditor ? "true" : "false"}"
          aria-label="Add branch rule"
        >${renderWorkflowTargetAddIcon()}</button>
      </div>
      ${renderWorkflowTargetEditor(group, menuState, targets)}
      <div class="workflow-target-list" role="list">
        ${targets.length > 0
          ? targets.map((target) => renderWorkflowTarget(group, target, menuState, selectedTargetKey)).join("")
          : `<div class="workflow-target-empty">Add a branch rule to watch workflows.</div>`}
      </div>
      ${selectedTarget
        ? `<div class="workflow-target-workflows">
            <div class="workflow-target-workflows-title">Workflows for ${escapeHtml(getWorkflowTargetLabel(selectedTarget, menuState))}</div>
            ${workflows.map((workflow) => renderWorkflowTargetWorkflow(group, selectedTarget, workflow)).join("")}
          </div>`
        : ""}
    </section>
  `;
}

function renderWorkflowTargetEditor(
  group: WatchGroupViewModel,
  menuState: Extract<RepositoryWatchMenuState, { status: "loaded" }>,
  targets: WatchedWorkflowTarget[],
): string {
  if (!menuState.targetEditor) {
    return "";
  }

  if (menuState.targetEditor === "include" || menuState.targetEditor === "exclude") {
    return `
      <form class="workflow-target-pattern-form" data-action="add-workflow-pattern" data-kind="${menuState.targetEditor}">
        <div class="add-field workflow-target-pattern-field">
          <input
            class="workflow-target-pattern-input"
            name="pattern"
            data-draft-key="${escapeHtml(`${group.owner}/${group.repo}/${menuState.targetEditor}`)}"
            maxlength="255"
            placeholder="${menuState.targetEditor === "include" ? "release/*" : "release/experimental/*"}"
            aria-label="Branch pattern"
            autocomplete="off"
            autofocus
          />
          <div class="add-field-actions">
            <button class="add-form-submit" type="submit">Add</button>
          </div>
        </div>
      </form>
    `;
  }

  const existingKinds = new Set(targets.map((target) => target.kind));

  return `
    <div class="workflow-target-add-menu" role="menu">
      ${renderAddWorkflowTargetAction(group, "default", "Include default branch", existingKinds.has("default"))}
      ${renderAddWorkflowTargetAction(group, "own", "Include own branches", existingKinds.has("own"))}
      ${renderAddWorkflowTargetAction(group, "all", "Include all branches", existingKinds.has("all"))}
      <div class="workflow-target-add-divider"></div>
      ${renderAddWorkflowTargetAction(group, "include", "Include by pattern", false)}
      ${renderAddWorkflowTargetAction(group, "exclude", "Exclude by pattern", false)}
    </div>
  `;
}

function renderAddWorkflowTargetAction(
  group: WatchGroupViewModel,
  kind: WatchedWorkflowTargetKind,
  label: string,
  disabled: boolean,
): string {
  return `
    <button
      type="button"
      role="menuitem"
      data-action="add-workflow-target"
      data-owner="${escapeHtml(group.owner)}"
      data-repo="${escapeHtml(group.repo)}"
      data-kind="${kind}"
      ${disabled ? "disabled" : ""}
    >${renderWorkflowTargetSign(kind === "exclude")}<span>${label}</span></button>
  `;
}

function renderWorkflowTarget(
  group: WatchGroupViewModel,
  target: WatchedWorkflowTarget,
  menuState: Extract<RepositoryWatchMenuState, { status: "loaded" }>,
  selectedTargetKey: string | undefined,
): string {
  const targetKey = getWatchedWorkflowTargetKey(target);
  const selected = targetKey === selectedTargetKey;
  const label = getWorkflowTargetLabel(target, menuState);

  return `
    <div class="workflow-target-row${selected ? " is-selected" : ""}" role="listitem">
      <button
        class="workflow-target-select"
        type="button"
        data-action="select-workflow-target"
        data-target="${escapeHtml(targetKey)}"
        aria-pressed="${selected ? "true" : "false"}"
      >
        ${renderWorkflowTargetSign(target.kind === "exclude")}
        <span class="workflow-target-label">${escapeHtml(label)}</span>
      </button>
      <button
        class="workflow-target-remove"
        type="button"
        data-action="remove-workflow-target"
        data-owner="${escapeHtml(group.owner)}"
        data-repo="${escapeHtml(group.repo)}"
        data-target="${escapeHtml(targetKey)}"
        aria-label="Remove ${escapeHtml(label)}"
      >${renderWorkflowTargetRemoveIcon()}</button>
    </div>
  `;
}

function renderWorkflowTargetWorkflow(
  group: WatchGroupViewModel,
  target: WatchedWorkflowTarget,
  workflow: WorkflowDefinition,
): string {
  const checked = target.workflowNames.includes(workflow.name);

  return `
    <button
      class="workflow-target-workflow${checked ? " is-selected" : ""}"
      type="button"
      role="checkbox"
      aria-checked="${checked ? "true" : "false"}"
      data-action="toggle-workflow-subscription"
      data-owner="${escapeHtml(group.owner)}"
      data-repo="${escapeHtml(group.repo)}"
      data-workflow="${escapeHtml(workflow.name)}"
      data-target="${escapeHtml(getWatchedWorkflowTargetKey(target))}"
    ><span class="workflow-target-checkbox" aria-hidden="true">${checked ? renderWorkflowTargetCheckIcon() : ""}</span><span title="${escapeHtml(workflow.name)}">${escapeHtml(workflow.name)}</span></button>
  `;
}

function renderWorkflowTargetSign(exclude: boolean): string {
  return `
    <svg class="workflow-target-sign is-${exclude ? "exclude" : "include"}" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <path d="${exclude ? "M5 8h6" : "M5 8h6M8 5v6"}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"/>
    </svg>
  `;
}

function renderWorkflowTargetAddIcon(): string {
  return `
    <svg class="workflow-target-add-icon" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 2.5v7M2.5 6h7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"/>
    </svg>
  `;
}

function renderWorkflowTargetRemoveIcon(): string {
  return `
    <svg class="workflow-target-remove-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"/>
    </svg>
  `;
}

function renderWorkflowTargetCheckIcon(): string {
  return `
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="m2.5 6 2.25 2.25 4.75-4.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"/>
    </svg>
  `;
}

function getSelectedWorkflowTargetKey(
  menuState: Extract<RepositoryWatchMenuState, { status: "loaded" }>,
  targets: WatchedWorkflowTarget[],
): string | undefined {
  return targets.some((target) => getWatchedWorkflowTargetKey(target) === menuState.selectedTargetKey)
    ? menuState.selectedTargetKey
    : targets[0] ? getWatchedWorkflowTargetKey(targets[0]) : undefined;
}

function getWorkflowTargetLabel(
  target: WatchedWorkflowTarget,
  menuState: Extract<RepositoryWatchMenuState, { status: "loaded" }>,
): string {
  switch (target.kind) {
    case "default":
      return `Default · ${menuState.defaultBranch.trim() || "default branch"}`;
    case "own":
      return `Own · ${menuState.userLogin.trim() || "authenticated user"}`;
    case "all":
      return "All branches";
    case "include":
      return target.pattern ?? "Include pattern";
    case "exclude":
      return target.pattern ?? "Exclude pattern";
  }
}

function getWorkflowSubscriptionMenuWorkflows(
  group: WatchGroupViewModel,
  workflows: WorkflowDefinition[],
): WorkflowDefinition[] {
  const watchedRepo = findWatchedRepo(group);
  const workflowNames = new Set(workflows.map((workflow) => workflow.name));
  const missingSelectedWorkflows = (watchedRepo?.workflowTargets ?? [])
    .flatMap((target) => target.workflowNames)
    .filter((workflowName) => {
      if (workflowNames.has(workflowName)) {
        return false;
      }

      workflowNames.add(workflowName);
      return true;
    })
    .map((workflowName) => ({
      name: workflowName,
      path: "",
    }));

  return [...workflows, ...missingSelectedWorkflows];
}

  return renderRepositoryWatchMenu(group);
}
