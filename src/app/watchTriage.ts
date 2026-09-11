import type { WatchTriageState } from "../domain/watches";

export type WatchTriageAction = {
  label: string;
  state: WatchTriageState;
};

export function getWatchTriageActions(
  currentState: WatchTriageState,
): WatchTriageAction[] {
  if (currentState === "saved") {
    return [
      { label: "Move to Inbox", state: "inbox" },
      { label: "Done", state: "done" },
    ];
  }

  if (currentState === "done") {
    return [
      { label: "Move to Inbox", state: "inbox" },
      { label: "Move to Drafts", state: "saved" },
    ];
  }

  return [
    { label: "Move to Drafts", state: "saved" },
    { label: "Done", state: "done" },
  ];
}
