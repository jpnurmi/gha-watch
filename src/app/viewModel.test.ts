import { describe, expect, it } from "vitest";
import { createPopupViewModel } from "./viewModel";
import type { WatchRecord } from "../domain/watches";

function watch(overrides: Partial<WatchRecord>): WatchRecord {
  return {
    id: "getsentry/sentry/run/123",
    target: {
      kind: "run",
      owner: "getsentry",
      repo: "sentry",
      runId: "123",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
    },
    label: "CI / macOS (push)",
    status: "pending",
    lastState: undefined,
    active: true,
    error: undefined,
    ...overrides,
  };
}

describe("createPopupViewModel", () => {
  it("summarizes incomplete checks like GitHub's checks popup", () => {
    const model = createPopupViewModel([
      watch({ status: "in_progress", lastState: { status: "in_progress", conclusion: null } }),
      watch({ status: "queued", lastState: { status: "queued", conclusion: null } }),
      watch({
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
    ]);

    expect(model.title).toBe("Some checks haven't completed yet");
    expect(model.subtitle).toBe("1 in progress, 1 successful, and 1 queued checks");
    expect(model.headerTone).toBe("warning");
  });

  it("uses a muted header tone when every check passed", () => {
    const model = createPopupViewModel([
      watch({
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
    ]);

    expect(model.title).toBe("All checks have passed");
    expect(model.headerTone).toBe("success");
  });

  it("groups rows by repository in first-seen order", () => {
    const model = createPopupViewModel([
      watch({
        label: "CI",
        status: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
      }),
      watch({
        id: "jpnurmi/sentry-qml/run/456",
        target: {
          kind: "run",
          owner: "jpnurmi",
          repo: "sentry-qml",
          runId: "456",
          url: "https://github.com/jpnurmi/sentry-qml/actions/runs/456",
        },
        label: "E2E",
        status: "queued",
        lastState: { status: "queued", conclusion: null },
      }),
      watch({
        id: "getsentry/sentry/run/789",
        target: {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "789",
          url: "https://github.com/getsentry/sentry/actions/runs/789",
        },
        label: "Lint",
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
    ]);

    expect(model.groups.map((group) => [group.repoLabel, group.rows.map((row) => row.label)])).toEqual([
      ["getsentry/sentry", ["CI", "Lint"]],
      ["jpnurmi/sentry-qml", ["E2E"]],
    ]);
  });

  it("groups rows into a pull request and workflow tree inside each repository", () => {
    const model = createPopupViewModel([
      watch({
        target: {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/actions/runs/123",
        },
        source: {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        sourceState: "ready",
        label: "CI: Build app",
        metadata: {
          workflowName: "CI",
          runTitle: "Add hierarchical watch groups",
        },
        status: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
      }),
      watch({
        id: "getsentry/sentry/job/456",
        target: {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          jobId: "456",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
        },
        source: {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        sourceState: "ready",
        label: "CI: macOS",
        metadata: {
          workflowName: "CI",
          jobName: "macOS",
        },
        status: "queued",
        lastState: { status: "queued", conclusion: null },
      }),
      watch({
        id: "getsentry/sentry/run/789",
        target: {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "789",
          url: "https://github.com/getsentry/sentry/actions/runs/789",
        },
        label: "Release: Package app",
        metadata: {
          workflowName: "Release",
          runTitle: "Package app",
        },
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
    ]);

    expect(
      model.groups[0].tree.map((pullRequest) => ({
        kind: pullRequest.kind,
        label: pullRequest.label,
        referenceLabel: pullRequest.referenceLabel,
        detailLabel: pullRequest.detailLabel,
        prState: pullRequest.prState,
        rowCount: pullRequest.rowCount,
        rowIds: pullRequest.rowIds,
        statusLabel: pullRequest.statusLabel,
        tone: pullRequest.tone,
        rows: pullRequest.rows.map((row) => row.id),
        children: pullRequest.children.map((workflow) => ({
          kind: workflow.kind,
          label: workflow.label,
          referenceLabel: workflow.referenceLabel,
          detailLabel: workflow.detailLabel,
          prState: workflow.prState,
          rowCount: workflow.rowCount,
          rowIds: workflow.rowIds,
          statusLabel: workflow.statusLabel,
          tone: workflow.tone,
          primaryRowId: workflow.primaryRowId,
          rows: workflow.rows.map((row) => ({
            id: row.id,
            label: row.label,
            prReference: row.prReference,
            prState: row.prState,
            subject: row.subject,
          })),
        })),
      })),
    ).toEqual([
      {
        kind: "pull-request",
        label: "Add hierarchical watch groups",
        referenceLabel: "#51",
        detailLabel: "Ready · 1 workflow · 2 checks",
        prState: { label: "Ready", tone: "ready" },
        rowCount: 2,
        rowIds: ["getsentry/sentry/run/123", "getsentry/sentry/job/456"],
        statusLabel: "In progress",
        tone: "in-progress",
        rows: [],
        children: [
          {
            kind: "workflow",
            label: "CI",
            referenceLabel: undefined,
            detailLabel: "2 checks",
            prState: undefined,
            rowCount: 2,
            rowIds: ["getsentry/sentry/run/123", "getsentry/sentry/job/456"],
            statusLabel: "In progress",
            tone: "in-progress",
            primaryRowId: "getsentry/sentry/run/123",
            rows: [
              {
                id: "getsentry/sentry/run/123",
                label: "Build app",
                prReference: undefined,
                prState: undefined,
                subject: "workflow",
              },
              {
                id: "getsentry/sentry/job/456",
                label: "macOS",
                prReference: undefined,
                prState: undefined,
                subject: "job",
              },
            ],
          },
        ],
      },
      {
        kind: "workflow",
        label: "Release: Package app",
        referenceLabel: undefined,
        detailLabel: undefined,
        prState: undefined,
        rowCount: 0,
        rowIds: ["getsentry/sentry/run/789"],
        statusLabel: "Successful",
        tone: "success",
        rows: [],
        children: [],
      },
    ]);
    expect(model.groups[0].items.map((item) => item.kind)).toEqual(["tree", "tree"]);
    expect(model.groups[0].items[1]).toMatchObject({
      kind: "tree",
      node: {
        id: "workflow-run:getsentry/sentry/run/789",
        label: "Release: Package app",
        kind: "workflow",
      },
    });
  });

  it("keeps direct job watches as top-level rows instead of wrapping them in workflow groups", () => {
    const model = createPopupViewModel([
      watch({
        id: "getsentry/sentry/job/456",
        target: {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          jobId: "456",
          url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
        },
        label: "CI: macOS",
        metadata: {
          workflowName: "CI",
          jobName: "macOS",
        },
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
    ]);

    expect(model.groups[0].tree).toEqual([]);
    expect(model.groups[0].items).toMatchObject([
      {
        kind: "row",
        row: {
          id: "getsentry/sentry/job/456",
          label: "CI: macOS",
          subject: "job",
        },
      },
    ]);
  });

  it("renders direct workflow watches as top-level workflow groups with job children", () => {
    const sourceRun = {
      kind: "run" as const,
      owner: "getsentry",
      repo: "sentry",
      runId: "123",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
    };
    const model = createPopupViewModel([
      watch({
        target: sourceRun,
        label: "CI: Fix tests",
        metadata: {
          workflowName: "CI",
          runTitle: "Fix tests",
        },
        status: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
      }),
      watch({
        id: "getsentry/sentry/job/456",
        target: {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          jobId: "456",
          url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
        },
        sourceRun,
        label: "CI: Linux",
        metadata: {
          workflowName: "CI",
          jobName: "Linux",
        },
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
      watch({
        id: "getsentry/sentry/job/789",
        target: {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          jobId: "789",
          url: "https://github.com/getsentry/sentry/actions/runs/123/job/789",
        },
        sourceRun,
        label: "CI: Windows",
        metadata: {
          workflowName: "CI",
          jobName: "Windows",
        },
        status: "queued",
        lastState: { status: "queued", conclusion: null },
      }),
    ]);

    expect(model.groups[0].items.map((item) => item.kind)).toEqual(["tree"]);
    expect(model.groups[0].tree).toMatchObject([
      {
        kind: "workflow",
        id: "workflow-run:getsentry/sentry/run/123",
        label: "CI: Fix tests",
        detailLabel: "2 checks",
        rowCount: 2,
        rowIds: ["getsentry/sentry/run/123", "getsentry/sentry/job/456", "getsentry/sentry/job/789"],
        statusLabel: "In progress",
        tone: "in-progress",
        primaryRowId: "getsentry/sentry/run/123",
        url: "https://github.com/getsentry/sentry/actions/runs/123",
        rows: [
          {
            id: "getsentry/sentry/job/456",
            label: "Linux",
            prReference: undefined,
            prState: undefined,
            subject: "job",
          },
          {
            id: "getsentry/sentry/job/789",
            label: "Windows",
            prReference: undefined,
            prState: undefined,
            subject: "job",
          },
        ],
      },
    ]);
    expect(model.subtitle).toBe("1 in progress, 1 successful, and 1 queued checks");
  });

  it("aggregates a workflow with successful and skipped jobs as successful", () => {
    const model = createPopupViewModel([
      watch({
        id: "getsentry/sentry/job/456",
        target: {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          jobId: "456",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
        },
        source: {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        sourceState: "ready",
        label: "CI: Linux",
        metadata: {
          workflowName: "CI",
          jobName: "Linux",
          prTitle: "Ignore optional job",
        },
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
      watch({
        id: "getsentry/sentry/job/789",
        target: {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          jobId: "789",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/actions/runs/123/job/789",
        },
        source: {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        sourceState: "ready",
        label: "CI: Optional",
        metadata: {
          workflowName: "CI",
          jobName: "Optional",
          prTitle: "Ignore optional job",
        },
        status: "completed:skipped",
        active: false,
        lastState: { status: "completed", conclusion: "skipped" },
      }),
    ]);

    const pullRequest = model.groups[0].tree[0];
    const workflow = pullRequest.children[0];

    expect(workflow.rows.map((row) => [row.label, row.tone])).toEqual([
      ["Linux", "success"],
      ["Optional", "skipped"],
    ]);
    expect(workflow).toMatchObject({
      label: "CI",
      statusLabel: "Successful",
      tone: "success",
    });
    expect(pullRequest).toMatchObject({
      label: "Ignore optional job",
      statusLabel: "Successful",
      tone: "success",
    });
  });

  it("keeps PR workflow run rows visible when no jobs were resolved", () => {
    const model = createPopupViewModel([
      watch({
        target: {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/actions/runs/123",
        },
        source: {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        sourceState: "ready",
        label: "CI: fix: Read lengths for variadic finger trees",
        metadata: {
          workflowName: "CI",
          runTitle: "fix: Read lengths for variadic finger trees",
        },
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
    ]);

    expect(model.groups[0].tree[0].children[0]).toMatchObject({
      kind: "workflow",
      label: "CI",
      detailLabel: "1 check",
      primaryRowId: "getsentry/sentry/run/123",
      url: "https://github.com/getsentry/sentry/actions/runs/123",
      rows: [
        {
          id: "getsentry/sentry/run/123",
          label: "Run #123",
          prReference: undefined,
          prState: undefined,
          subject: "workflow",
        },
      ],
    });
    expect(model.groups[0].tree[0]).toMatchObject({
      kind: "pull-request",
      url: "https://github.com/getsentry/sentry/pull/51",
    });
  });

  it("keeps one PR group when the PR title is only present on a later row", () => {
    const model = createPopupViewModel([
      watch({
        id: "getsentry/sentry/job/456",
        target: {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          jobId: "456",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
        },
        source: {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        sourceState: "ready",
        label: "CI: macOS",
        metadata: {
          workflowName: "CI",
          jobName: "macOS",
        },
        status: "queued",
        lastState: { status: "queued", conclusion: null },
      }),
      watch({
        target: {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/actions/runs/123",
        },
        source: {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        sourceState: "ready",
        label: "CI: Add hierarchical watch groups",
        metadata: {
          workflowName: "CI",
          runTitle: "Add hierarchical watch groups",
        },
        status: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
      }),
    ]);

    expect(model.groups[0].tree).toHaveLength(1);
    expect(model.groups[0].tree[0]).toMatchObject({
      kind: "pull-request",
      id: "pull-request:getsentry/sentry:#51",
      label: "Add hierarchical watch groups",
      referenceLabel: "#51",
      detailLabel: "Ready · 1 workflow · 2 checks",
      rowIds: ["getsentry/sentry/job/456", "getsentry/sentry/run/123"],
    });
  });

  it("orders repository groups by saved repo order", () => {
    const model = createPopupViewModel(
      [
        watch({
          label: "CI",
          status: "in_progress",
          lastState: { status: "in_progress", conclusion: null },
        }),
        watch({
          id: "jpnurmi/sentry-qml/run/456",
          target: {
            kind: "run",
            owner: "jpnurmi",
            repo: "sentry-qml",
            runId: "456",
            url: "https://github.com/jpnurmi/sentry-qml/actions/runs/456",
          },
          label: "E2E",
          status: "queued",
          lastState: { status: "queued", conclusion: null },
        }),
        watch({
          id: "jpnurmi/gha-watch/run/789",
          target: {
            kind: "run",
            owner: "jpnurmi",
            repo: "gha-watch",
            runId: "789",
            url: "https://github.com/jpnurmi/gha-watch/actions/runs/789",
          },
          label: "Build",
          status: "queued",
          lastState: { status: "queued", conclusion: null },
        }),
      ],
      new Date(),
      [],
      ["jpnurmi/sentry-qml", "getsentry/sentry"],
    );

    expect(model.groups.map((group) => group.repoLabel)).toEqual([
      "jpnurmi/sentry-qml",
      "getsentry/sentry",
      "jpnurmi/gha-watch",
    ]);
  });

  it("exposes a repository icon URL for grouped rows", () => {
    const model = createPopupViewModel([
      watch({
        repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
    ]);

    expect(model.groups).toMatchObject([
      {
        repoLabel: "getsentry/sentry",
        repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
      },
    ]);
  });

  it("keeps favorite repos visible even when they have no watches", () => {
    const model = createPopupViewModel(
      [
        watch({
          label: "CI",
          status: "in_progress",
          lastState: { status: "in_progress", conclusion: null },
        }),
      ],
      new Date(),
      [
        {
          owner: "jpnurmi",
          repo: "gha-watch",
          repoIconUrl: "https://avatars.githubusercontent.com/u/123?v=4",
        },
      ],
    );

    expect(
      model.groups.map((group) => ({
        repoLabel: group.repoLabel,
        favorite: group.favorite,
        repoIconUrl: group.repoIconUrl,
        rowCount: group.rows.length,
      })),
    ).toEqual([
      {
        repoLabel: "jpnurmi/gha-watch",
        favorite: true,
        repoIconUrl: "https://avatars.githubusercontent.com/u/123?v=4",
        rowCount: 0,
      },
      {
        repoLabel: "getsentry/sentry",
        favorite: false,
        repoIconUrl: undefined,
        rowCount: 1,
      },
    ]);
  });

  it("marks watched repo groups as favorites when the repo is favorited", () => {
    const model = createPopupViewModel(
      [
        watch({
          repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
          label: "CI",
          status: "in_progress",
          lastState: { status: "in_progress", conclusion: null },
        }),
      ],
      new Date(),
      [{ owner: "getsentry", repo: "sentry" }],
    );

    expect(model.groups).toMatchObject([
      {
        owner: "getsentry",
        repo: "sentry",
        repoLabel: "getsentry/sentry",
        favorite: true,
        repoIconUrl: "https://avatars.githubusercontent.com/u/1396951?v=4",
        rows: [{ label: "CI" }],
      },
    ]);
  });

  it("prioritizes failed checks in the header", () => {
    const model = createPopupViewModel([
      watch({
        status: "completed:failure",
        active: false,
        lastState: { status: "completed", conclusion: "failure" },
      }),
    ]);

    expect(model.title).toBe("Some checks were not successful");
    expect(model.subtitle).toBe("1 failed check");
    expect(model.rows[0].canRerun).toBe(true);
  });

  it("marks PR-sourced row removal as workflow exclusion", () => {
    const model = createPopupViewModel([
      watch({
        source: {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        sourceState: "ready",
      }),
    ]);

    expect(model.rows[0].removeMode).toBe("ignore-pr-workflow");
  });

  it("presents cancelled checks distinctly from failed checks", () => {
    const model = createPopupViewModel([
      watch({
        status: "completed:cancelled",
        active: false,
        lastState: { status: "completed", conclusion: "cancelled" },
      }),
    ]);

    expect(model.title).toBe("Some checks were cancelled");
    expect(model.subtitle).toBe("1 cancelled check");
    expect(model.rows.map((row) => [row.statusLabel, row.description, row.tone])).toEqual([
      ["Cancelled", "This check was cancelled.", "cancelled"],
    ]);
  });

  it("presents skipped checks distinctly from failed checks", () => {
    const model = createPopupViewModel([
      watch({
        status: "completed:skipped",
        active: false,
        lastState: { status: "completed", conclusion: "skipped" },
      }),
    ]);

    expect(model.title).toBe("Some checks were skipped");
    expect(model.subtitle).toBe("1 skipped check");
    expect(model.rows.map((row) => [row.statusLabel, row.description, row.tone, row.canRerun])).toEqual([
      ["Skipped", "This check was skipped.", "skipped", false],
    ]);
  });

  it("creates row text for queued and in-progress watches", () => {
    const model = createPopupViewModel([
      watch({ status: "queued", lastState: { status: "queued", conclusion: null } }),
      watch({ status: "in_progress", lastState: { status: "in_progress", conclusion: null } }),
    ]);

    expect(model.rows.map((row) => [row.statusLabel, row.description, row.tone])).toEqual([
      ["Queued", "Waiting to run this check...", "queued"],
      ["In progress", "This check has started...", "in-progress"],
    ]);
  });

  it("keeps workflow status separate from pull request source state", () => {
    const model = createPopupViewModel([
      watch({
        sourceState: "draft",
        status: "in_progress",
        lastState: { status: "in_progress", conclusion: null },
      }),
      watch({
        id: "getsentry/sentry/run/456",
        sourceState: "ready",
        status: "queued",
        lastState: { status: "queued", conclusion: null },
      }),
      watch({
        id: "getsentry/sentry/run/789",
        sourceState: "merged",
        status: "completed:success",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
      watch({
        id: "getsentry/sentry/run/790",
        sourceState: "closed",
        status: "completed:failure",
        active: false,
        lastState: { status: "completed", conclusion: "failure" },
      }),
    ]);

    expect(
      model.rows.map((row) => [row.statusLabel, row.tone, row.prState?.label, row.prState?.tone]),
    ).toEqual([
      ["In progress", "in-progress", "Draft", "draft"],
      ["Queued", "queued", "Ready", "ready"],
      ["Successful", "success", "Merged", "merged"],
      ["Failed", "failure", "Closed", "closed"],
    ]);
  });

  it("classifies leaf rows by watched check target even when they come from a PR", () => {
    const model = createPopupViewModel([
      watch({
        sourceState: "merged",
        target: {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/actions/runs/123",
        },
      }),
      watch({
        id: "getsentry/sentry/run/456",
        target: {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "456",
          url: "https://github.com/getsentry/sentry/actions/runs/456",
        },
      }),
      watch({
        id: "getsentry/sentry/job/789",
        target: {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          runId: "456",
          jobId: "789",
          url: "https://github.com/getsentry/sentry/actions/runs/456/job/789",
        },
      }),
    ]);

    expect(model.rows.map((row) => row.subject)).toEqual(["workflow", "workflow", "job"]);
  });

  it("marks rows with unseen status changes", () => {
    const model = createPopupViewModel([
      watch({
        status: "completed:success",
        lastSeenStatus: "in_progress",
        active: false,
        lastState: { status: "completed", conclusion: "success" },
      }),
      watch({
        id: "getsentry/sentry/run/456",
        status: "queued",
        lastSeenStatus: "queued",
        lastState: { status: "queued", conclusion: null },
      }),
    ]);

    expect(model.rows.map((row) => [row.id, row.unseenStatusChange])).toEqual([
      ["getsentry/sentry/run/123", true],
      ["getsentry/sentry/run/456", false],
    ]);
  });

  it("aggregates unseen status changes onto pull request and workflow tree nodes", () => {
    const model = createPopupViewModel([
      watch({
        target: {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/actions/runs/123",
        },
        source: {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        label: "CI: Build app",
        status: "completed:success",
        lastSeenStatus: "in_progress",
        lastState: { status: "completed", conclusion: "success" },
        metadata: {
          workflowName: "CI",
          runTitle: "Add hierarchical watch groups",
        },
      }),
      watch({
        id: "getsentry/sentry/job/456",
        target: {
          kind: "job",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          jobId: "456",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/actions/runs/123/job/456",
        },
        source: {
          kind: "pr",
          owner: "getsentry",
          repo: "sentry",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/pull/51",
        },
        label: "CI: Tests",
        status: "completed:success",
        lastSeenStatus: "completed:success",
        lastState: { status: "completed", conclusion: "success" },
        metadata: {
          workflowName: "CI",
          runTitle: "Add hierarchical watch groups",
          jobName: "Tests",
        },
      }),
    ]);

    const pullRequest = model.groups[0].tree[0];
    const workflow = pullRequest.children[0];

    expect(pullRequest.unseenStatusChange).toBe(true);
    expect(workflow.unseenStatusChange).toBe(true);
    expect(workflow.rows.map((row) => [row.id, row.unseenStatusChange])).toEqual([
      ["getsentry/sentry/run/123", true],
      ["getsentry/sentry/job/456", false],
    ]);
  });

  it("exposes muted pull request references for watch titles", () => {
    const model = createPopupViewModel([
      watch({
        target: {
          kind: "run",
          owner: "getsentry",
          repo: "sentry",
          runId: "123",
          prNumber: "51",
          url: "https://github.com/getsentry/sentry/actions/runs/123?pr=51",
        },
      }),
    ]);

    expect(model.rows[0].prReference).toBe("#51");
  });

  it("formats queued, running, and completed timing text", () => {
    const now = new Date("2026-05-16T12:10:00Z");
    const model = createPopupViewModel(
      [
        watch({
          status: "queued",
          lastState: { status: "queued", conclusion: null },
          timing: {
            queuedAt: "2026-05-16T12:06:00Z",
          },
        }),
        watch({
          id: "getsentry/sentry/run/456",
          status: "in_progress",
          lastState: { status: "in_progress", conclusion: null },
          timing: {
            startedAt: "2026-05-16T12:08:00Z",
          },
        }),
        watch({
          id: "getsentry/sentry/run/789",
          status: "completed:success",
          active: false,
          lastState: { status: "completed", conclusion: "success" },
          timing: {
            startedAt: "2026-05-16T12:02:00Z",
            completedAt: "2026-05-16T12:09:00Z",
          },
        }),
      ],
      now,
    );

    expect(model.rows.map((row) => row.timingText)).toEqual([
      "Queued 4m ago",
      "Started 2m ago · 2m elapsed",
      "Completed 1m ago · 7m",
    ]);
  });
});
