import type { WatchRecord } from "../domain/watches";
import { invokeDesktop } from "../platform/desktop";

export const screenshotNow = new Date("2026-05-17T12:00:00Z");

export function createScreenshotWatches(): WatchRecord[] {
  const pullRequest = (repo: string, number: string, title: string): WatchRecord => ({
    id: `getsentry/${repo}/pull/${number}`,
    target: {
      kind: "pr", owner: "getsentry", repo, prNumber: number,
      url: `https://github.com/getsentry/${repo}/pull/${number}`,
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
    pullRequest("sentry", "12", "Add watched repository quick watches"),
    {
      id: "getsentry/sentry/job/42",
      target: {
        kind: "job", owner: "getsentry", repo: "sentry", runId: "11", jobId: "42",
        url: "https://github.com/getsentry/sentry/actions/runs/11/job/42",
      },
      label: "Build / package app (macOS)",
      metadata: { workflowName: "Build", jobName: "package app (macOS)", branchName: "main" },
      status: "completed:failure",
      lastState: { status: "completed", conclusion: "failure" },
      timing: { startedAt: "2026-05-17T11:50:00Z", completedAt: "2026-05-17T11:54:00Z" },
      lastSeenStatus: "in_progress",
      note: "Check the signing step before re-running.",
      active: false,
      error: undefined,
    },
    {
      id: "getsentry/sentry/run/22",
      target: {
        kind: "run", owner: "getsentry", repo: "sentry", runId: "22",
        url: "https://github.com/getsentry/sentry/actions/runs/22",
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
      ...pullRequest("relay", "812", "Keep discovery results compact"),
      status: "completed:success",
      lastState: { status: "completed", conclusion: "success" },
      timing: { startedAt: "2026-05-17T11:48:00Z", completedAt: "2026-05-17T11:51:00Z" },
      active: false,
    },
    {
      ...pullRequest("sentry", "13", "Refine tray popup spacing"),
      sourceState: "draft",
      triageState: "saved",
    },
    {
      ...pullRequest("seer", "94", "Improve workflow status handling"),
      sourceState: "merged",
      triageState: "done",
      doneAt: screenshotNow.toISOString(),
      status: "completed:success",
      lastState: { status: "completed", conclusion: "success" },
      active: false,
    },
  ];
}

export async function captureScreenshot(): Promise<void> {
  await document.fonts.ready;
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => resolve());
  }));
  await invokeDesktop("screenshot_ready");
}
