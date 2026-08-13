export type GlobalShortcutEvent = {
  state: "Pressed" | "Released";
};

export type GlobalShortcutApi = {
  register(shortcut: string, handler: (event: GlobalShortcutEvent) => void): Promise<void>;
  unregister(shortcut: string): Promise<void>;
};

export type GlobalShortcutRegistrationStatus =
  | { state: "disabled" }
  | { state: "registering"; shortcut: string }
  | { state: "registered"; shortcut: string }
  | { state: "error"; shortcut: string; error: string };

export type GlobalShortcutRegistration = {
  configure(enabled: boolean, shortcut: string): Promise<void>;
  dispose(): Promise<void>;
};

export function createGlobalShortcutRegistration(
  api: GlobalShortcutApi,
  onTrigger: () => void,
  onStatusChange: (status: GlobalShortcutRegistrationStatus) => void,
): GlobalShortcutRegistration {
  let currentShortcut: string | undefined;
  let desiredRevision = 0;
  let queue = Promise.resolve();

  function enqueue(operation: () => Promise<void>): Promise<void> {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  }

  async function unregisterCurrent(): Promise<void> {
    if (!currentShortcut) {
      return;
    }

    const shortcut = currentShortcut;
    currentShortcut = undefined;

    try {
      await api.unregister(shortcut);
    } catch {
      // A process exit or externally removed registration already leaves it inactive.
    }
  }

  return {
    configure(enabled, shortcut) {
      const revision = ++desiredRevision;
      const normalizedShortcut = shortcut.trim();

      return enqueue(async () => {
        await unregisterCurrent();

        if (revision !== desiredRevision) {
          return;
        }

        if (!enabled) {
          onStatusChange({ state: "disabled" });
          return;
        }

        onStatusChange({ state: "registering", shortcut: normalizedShortcut });

        try {
          await api.register(normalizedShortcut, (event) => {
            if (
              event.state === "Pressed" &&
              currentShortcut === normalizedShortcut &&
              revision === desiredRevision
            ) {
              onTrigger();
            }
          });

          if (revision !== desiredRevision) {
            try {
              await api.unregister(normalizedShortcut);
            } catch {
              // A newer configuration remains authoritative.
            }
            return;
          }

          currentShortcut = normalizedShortcut;
          onStatusChange({ state: "registered", shortcut: normalizedShortcut });
        } catch (error) {
          onStatusChange({
            state: "error",
            shortcut: normalizedShortcut,
            error: getErrorMessage(error),
          });
        }
      });
    },

    dispose() {
      ++desiredRevision;
      return enqueue(async () => {
        await unregisterCurrent();
        onStatusChange({ state: "disabled" });
      });
    },
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
