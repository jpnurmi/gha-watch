import type { WatchRecord } from "../domain/watches";

export const screenshotNow = new Date("2026-05-17T12:00:00Z");

export function createScreenshotWatches(): WatchRecord[] {
  const pullRequest = (repo: string, number: string, title: string): WatchRecord => ({
    id: `jpnurmi/${repo}/pull/${number}`,
    target: {
      kind: "pr", owner: "jpnurmi", repo, prNumber: number,
      url: `https://github.com/jpnurmi/${repo}/pull/${number}`,
    },
    label: title,
    metadata: { prTitle: title, branchName: "feat/tray-badges" },
    sourceState: "ready",
    status: "in_progress",
    lastState: { status: "in_progress", conclusion: null },
    timing: { startedAt: "2026-05-17T11:56:00Z" },
    active: true,
    error: undefined,
  });

  return [
    pullRequest("gha-watch", "12", "Add workflow quick watches"),
    {
      id: "jpnurmi/gha-watch/job/42",
      target: {
        kind: "job", owner: "jpnurmi", repo: "gha-watch", runId: "11", jobId: "42",
        url: "https://github.com/jpnurmi/gha-watch/actions/runs/11/job/42",
      },
      label: "Build / package app",
      metadata: { workflowName: "Build", jobName: "package app", branchName: "main" },
      status: "completed:failure",
      lastState: { status: "completed", conclusion: "failure" },
      timing: { startedAt: "2026-05-17T11:50:00Z", completedAt: "2026-05-17T11:54:00Z" },
      lastSeenStatus: "in_progress",
      note: "Check the signing step before re-running.",
      active: false,
      error: undefined,
    },
    {
      id: "jpnurmi/gha-watch/run/22",
      target: {
        kind: "run", owner: "jpnurmi", repo: "gha-watch", runId: "22",
        url: "https://github.com/jpnurmi/gha-watch/actions/runs/22",
      },
      label: "Release: Package app",
      metadata: { workflowName: "Release", runTitle: "Package app", branchName: "release/0.2" },
      status: "queued",
      lastState: { status: "queued", conclusion: null },
      timing: { queuedAt: "2026-05-17T11:59:00Z" },
      active: true,
      error: undefined,
    },
    {
      ...pullRequest("cuotax", "28", "Keep quota details compact"),
      status: "completed:success",
      lastState: { status: "completed", conclusion: "success" },
      timing: { startedAt: "2026-05-17T11:48:00Z", completedAt: "2026-05-17T11:51:00Z" },
      active: false,
    },
    {
      ...pullRequest("gha-watch", "13", "Refine tray popup spacing"),
      sourceState: "draft",
      triageState: "saved",
    },
    {
      ...pullRequest("gha-watch", "14", "Improve workflow status handling"),
      sourceState: "merged",
      triageState: "done",
      doneAt: screenshotNow.toISOString(),
      status: "completed:success",
      lastState: { status: "completed", conclusion: "success" },
      active: false,
    },
  ];
}
