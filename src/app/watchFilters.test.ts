import { describe, expect, it } from "vitest";
import type { WatchRecord } from "../domain/watches";
import type { WatchRowViewModel } from "./viewModel";
import {
  createEmptyWatchFilters,
  createWatchFiltersByView,
  filterWatchCandidates,
  getWatchFilterKeyboardAction,
  getWatchRepositories,
  matchesWatchFilters,
  normalizeWatchFilters,
  toggleWatchFilterStatus,
  type WatchFilterCandidate,
  type WatchFilters,
} from "./watchFilters";

describe("watch filters", () => {
  it.each([
    ["owner", " UNIQUEOWNER ", { owner: "UniqueOwner" }],
    ["repository", " uniquerepo ", { repo: "UniqueRepo" }],
    ["PR number", " #9182 ", { prNumber: "9182" }],
    ["PR title", " FIX UNIQUE RACE ", { prTitle: "Fix unique race" }],
    ["workflow", " UNIQUE WORKFLOW ", { workflowName: "Unique Workflow" }],
    ["job", " UNIQUE JOB ", { jobName: "Unique Job" }],
    ["branch", " FEATURE/UNIQUE-BRANCH ", { branchName: "feature/unique-branch" }],
    ["run ID", " 774499 ", { runId: "774499" }],
    ["displayed status", " UNIQUE DISPLAY STATUS ", { statusLabel: "Unique display status" }],
  ])("matches trimmed, case-insensitive %s text", (_field, query, override) => {
    expect(matchesWatchFilters(candidate(override), filters({ query }))).toBe(true);
  });

  it("combines text, status, and repository filters with AND semantics", () => {
    const matching = candidate({
      owner: "getsentry",
      repo: "sentry",
      workflowName: "Mobile CI",
      stateStatus: "completed",
      conclusion: "failure",
    });
    const wrongText = candidate({
      owner: "getsentry",
      repo: "sentry",
      workflowName: "Web CI",
      stateStatus: "completed",
      conclusion: "failure",
    });
    const wrongStatus = candidate({
      owner: "getsentry",
      repo: "sentry",
      workflowName: "Mobile CI",
      stateStatus: "completed",
      conclusion: "success",
    });
    const wrongRepo = candidate({
      owner: "getsentry",
      repo: "relay",
      workflowName: "Mobile CI",
      stateStatus: "completed",
      conclusion: "failure",
    });

    expect(filterWatchCandidates(
      [matching, wrongText, wrongStatus, wrongRepo],
      filters({ query: "mobile", repository: "getsentry/sentry", statuses: ["failing"] }),
    )).toEqual([matching]);
  });

  it("matches any selected status facet", () => {
    const running = candidate({ stateStatus: "queued" });
    const successful = candidate({ stateStatus: "completed", conclusion: "success" });
    const cancelled = candidate({ stateStatus: "completed", conclusion: "cancelled" });

    expect(filterWatchCandidates(
      [running, successful, cancelled],
      filters({ statuses: ["running", "successful"] }),
    )).toEqual([running, successful]);
  });

  it("treats queued, pending, waiting, requested, and in-progress watches as running", () => {
    for (const stateStatus of ["queued", "pending", "waiting", "requested", "in_progress"]) {
      expect(matchesWatchFilters(candidate({ stateStatus }), filters({ statuses: ["running"] }))).toBe(true);
    }
  });

  it("uses domain state for failing, errored, and unseen facets", () => {
    const failingChild = candidate({ stateStatus: "in_progress", hasFailedChildren: true });
    const errored = candidate({ error: "GitHub unavailable", statusLabel: "Pending" });
    const unseen = candidate({ status: "completed:success", lastSeenStatus: "in_progress", statusLabel: "Pending" });
    const labelsOnly = candidate({ statusLabel: "Failing Errored Unseen" });

    expect(matchesWatchFilters(failingChild, filters({ statuses: ["failing"] }))).toBe(true);
    expect(matchesWatchFilters(errored, filters({ statuses: ["errored"] }))).toBe(true);
    expect(matchesWatchFilters(errored, filters({ statuses: ["running"] }))).toBe(false);
    expect(matchesWatchFilters(unseen, filters({ statuses: ["unseen"] }))).toBe(true);
    expect(matchesWatchFilters(labelsOnly, filters({ statuses: ["failing", "errored", "unseen"] }))).toBe(false);
  });

  it("normalizes filters and keeps facets in their documented order", () => {
    expect(normalizeWatchFilters({
      query: "  Build App  ",
      repository: "  GetSentry/Sentry ",
      statuses: ["unseen", "running", "unseen"],
    })).toEqual({
      query: "build app",
      repository: "getsentry/sentry",
      statuses: ["running", "unseen"],
    });
  });

  it("keeps independent local filter state for every triage view", () => {
    const byView = createWatchFiltersByView();
    byView.inbox.query = "inbox query";
    byView.saved.statuses.push("failing");
    byView.done.repository = "getsentry/sentry";

    expect(byView).toEqual({
      inbox: { query: "inbox query", statuses: [] },
      saved: { query: "", statuses: ["failing"] },
      done: { query: "", repository: "getsentry/sentry", statuses: [] },
    });
    expect(new Set(Object.values(byView)).size).toBe(3);
  });

  it("returns distinct sorted repositories", () => {
    expect(getWatchRepositories([
      candidate({ owner: "z", repo: "two" }).watch,
      candidate({ owner: "a", repo: "one" }).watch,
      candidate({ owner: "z", repo: "two", runId: "2" }).watch,
    ])).toEqual(["a/one", "z/two"]);
  });

  it("toggles status facets without disturbing other filter fields", () => {
    const initial = filters({ query: "ci", statuses: ["unseen"] });
    const added = toggleWatchFilterStatus(initial, "running");

    expect(added).toEqual({ query: "ci", statuses: ["running", "unseen"] });
    expect(toggleWatchFilterStatus(added, "unseen")).toEqual({
      query: "ci",
      statuses: ["running"],
    });
  });
});

describe("watch filter keyboard behavior", () => {
  it("focuses search for slash only outside a text control", () => {
    expect(keyboardAction("/", { textControlActive: false })).toBe("focus-search");
    expect(keyboardAction("/", { textControlActive: true })).toBe("none");
  });

  it("clears the query before closing controls or dismissing the popup", () => {
    expect(keyboardAction("Escape", {
      filters: filters({ query: "ci", statuses: ["failing"] }),
      filtersFocused: true,
    })).toBe("clear-query");
    expect(keyboardAction("Escape", {
      filters: filters({ statuses: ["failing"] }),
    })).toBe("close-filters");
    expect(keyboardAction("Escape", { filtersFocused: true })).toBe("close-filters");
    expect(keyboardAction("Escape")).toBe("dismiss-popup");
  });

  it("does not assign Enter a filter or Add-form action", () => {
    expect(keyboardAction("Enter", { textControlActive: false })).toBe("none");
    expect(keyboardAction("Enter", { textControlActive: true })).toBe("none");
  });
});

type CandidateOptions = {
  branchName?: string;
  conclusion?: string | null;
  error?: string;
  hasFailedChildren?: boolean;
  jobName?: string;
  lastSeenStatus?: string;
  owner?: string;
  prNumber?: string;
  prTitle?: string;
  repo?: string;
  runId?: string;
  stateStatus?: string;
  status?: string;
  statusLabel?: string;
  workflowName?: string;
};

function candidate(options: CandidateOptions = {}): WatchFilterCandidate {
  const owner = options.owner ?? "getsentry";
  const repo = options.repo ?? "sentry";
  const runId = options.runId ?? "123";
  const stateStatus = options.stateStatus ?? "in_progress";
  const conclusion = options.conclusion ?? null;
  const status = options.status ?? stateStatus;
  const watch: WatchRecord = {
    id: `${owner}/${repo}/run/${runId}`,
    target: {
      kind: "run",
      owner,
      repo,
      runId,
      ...(options.prNumber ? { prNumber: options.prNumber } : {}),
      url: `https://github.com/${owner}/${repo}/actions/runs/${runId}`,
    },
    label: "CI: Build",
    metadata: {
      ...(options.prTitle ? { prTitle: options.prTitle } : {}),
      ...(options.workflowName ? { workflowName: options.workflowName } : {}),
      ...(options.jobName ? { jobName: options.jobName } : {}),
      ...(options.branchName ? { branchName: options.branchName } : {}),
    },
    status,
    ...(options.lastSeenStatus ? { lastSeenStatus: options.lastSeenStatus } : {}),
    lastState: {
      status: stateStatus,
      conclusion,
      ...(options.hasFailedChildren ? { hasFailedChildren: true } : {}),
    },
    active: stateStatus !== "completed",
    error: options.error,
  };
  const row: WatchRowViewModel = {
    id: watch.id,
    label: "Build",
    subject: "workflow",
    ...(options.prNumber ? { prReference: `#${options.prNumber}` } : {}),
    statusLabel: options.statusLabel ?? "In progress",
    description: "This check has started.",
    tone: "in-progress",
    hasFailedChildren: Boolean(options.hasFailedChildren),
    unseenStatusChange: false,
    canRerun: false,
    canRerunFailed: false,
    doneCandidate: false,
    triageState: "inbox",
    url: watch.target.url,
  };

  return { row, watch };
}

function filters(overrides: Partial<WatchFilters> = {}): WatchFilters {
  return { ...createEmptyWatchFilters(), ...overrides };
}

function keyboardAction(
  key: string,
  options: Partial<Parameters<typeof getWatchFilterKeyboardAction>[0]> = {},
) {
  return getWatchFilterKeyboardAction({
    filters: createEmptyWatchFilters(),
    filtersFocused: false,
    key,
    textControlActive: false,
    ...options,
  });
}
