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
      { label: "Mark done", state: "done" },
    ];
  }

  if (currentState === "done") {
    return [
      { label: "Move to Inbox", state: "inbox" },
      { label: "Make draft", state: "saved" },
    ];
  }

  return [
    { label: "Make draft", state: "saved" },
    { label: "Mark done", state: "done" },
  ];
}
