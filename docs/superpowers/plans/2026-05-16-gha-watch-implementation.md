# GHA Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal cross-platform tray app that watches pasted GitHub Actions run or job links via the `gh` CLI and sends desktop notifications when status changes.

**Architecture:** A Tauri 2 shell provides tray, native notifications, and a small popup window. TypeScript contains the watcher domain logic, URL parsing, `gh` command adapter, persistence, and UI state. The app delegates GitHub auth and API access to the installed `gh` CLI.

**Tech Stack:** Tauri 2, Vite, TypeScript, Vitest, Rust only for Tauri bootstrap and tray setup, `gh` CLI as an external dependency.

---

## File Structure

- `package.json`: npm scripts and JS dependencies.
- `tsconfig.json`: TypeScript compiler options for app code.
- `tsconfig.node.json`: TypeScript compiler options for Vite config.
- `vite.config.ts`: Vite and Vitest configuration.
- `index.html`: Tauri webview entrypoint.
- `src/main.ts`: UI bootstrap and event wiring.
- `src/styles.css`: Compact tray popup styling.
- `src/domain/githubUrl.ts`: Parse GitHub Actions run/job URLs into watch targets.
- `src/domain/status.ts`: Normalize watch statuses and detect user-notifiable transitions.
- `src/domain/watches.ts`: Watch store shape and reducer-like operations.
- `src/platform/gh.ts`: `gh` CLI command adapter.
- `src/platform/notifications.ts`: Tauri notification wrapper.
- `src/platform/store.ts`: LocalStorage persistence wrapper for non-secret watch metadata.
- `src/app/watchController.ts`: Polling loop and state coordination.
- `src-tauri/Cargo.toml`: Rust crate dependencies and Tauri feature flags.
- `src-tauri/build.rs`: Tauri build script.
- `src-tauri/tauri.conf.json`: Tauri app configuration.
- `src-tauri/capabilities/default.json`: Minimum webview permissions for shell, notification, and opener APIs.
- `src-tauri/src/main.rs`: Tauri tray/menu setup and app bootstrap.
- `src-tauri/icons/tray-template.png`: Minimal tray icon asset.

## Task 1: Scaffold Tauri/Vite Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/icons/tray-template.png`

- [ ] **Step 1: Verify dependency versions from registries**

Run:

```bash
npm view @tauri-apps/cli version
npm view @tauri-apps/api version
npm view @tauri-apps/plugin-shell version
npm view @tauri-apps/plugin-notification version
npm view @tauri-apps/plugin-opener version
npm view vite version
npm view typescript version
npm view vitest version
cargo search tauri --limit 1
cargo search tauri-plugin-shell --limit 1
cargo search tauri-plugin-notification --limit 1
cargo search tauri-plugin-opener --limit 1
```

Expected: each command prints a current package or crate version.

- [ ] **Step 2: Create minimal app and Tauri config**

Create the files listed above using the verified versions. `src-tauri/src/main.rs` creates the tray icon, menu items for showing the popup and quitting, and hides the Dock icon on macOS by using accessory activation policy.

- [ ] **Step 3: Install dependencies**

Run:

```bash
npm install
```

Expected: dependencies install and `package-lock.json` is created.

## Task 2: Domain Tests First

**Files:**
- Create: `src/domain/githubUrl.ts`
- Create: `src/domain/githubUrl.test.ts`
- Create: `src/domain/status.ts`
- Create: `src/domain/status.test.ts`
- Create: `src/domain/watches.ts`
- Create: `src/domain/watches.test.ts`

- [ ] **Step 1: Write failing URL parser tests**

Cover:
- workflow run URL parses `owner`, `repo`, and `runId`
- job URL with `/job/JOB_ID` parses `jobId`
- legacy job URL with `/runs/JOB_ID` parses `jobId`
- non-GitHub URLs fail with a helpful error

- [ ] **Step 2: Run parser tests red**

Run:

```bash
npm test -- src/domain/githubUrl.test.ts
```

Expected: FAIL because the parser does not exist yet.

- [ ] **Step 3: Implement minimal URL parser**

Implement `parseGitHubActionsUrl(input: string): ParsedWatchTarget`.

- [ ] **Step 4: Run parser tests green**

Run:

```bash
npm test -- src/domain/githubUrl.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing status transition tests**

Cover:
- initial state does not notify
- `queued` to `in_progress` notifies
- `in_progress` to `completed:success` notifies
- identical statuses do not notify
- completed targets are terminal

- [ ] **Step 6: Run status tests red**

Run:

```bash
npm test -- src/domain/status.test.ts
```

Expected: FAIL because transition logic does not exist yet.

- [ ] **Step 7: Implement minimal status logic**

Implement normalized status types and `getStatusTransition(previous, next)`.

- [ ] **Step 8: Run status tests green**

Run:

```bash
npm test -- src/domain/status.test.ts
```

Expected: PASS.

## Task 3: `gh` Adapter Tests First

**Files:**
- Create: `src/platform/gh.ts`
- Create: `src/platform/gh.test.ts`

- [ ] **Step 1: Write failing adapter tests with a fake shell executor**

Cover:
- run target calls `gh run view RUN_ID -R OWNER/REPO --json ...`
- job target calls `gh api repos/OWNER/REPO/actions/jobs/JOB_ID`
- missing `gh` maps to a user-facing dependency error
- unauthenticated `gh` maps to a user-facing auth error

- [ ] **Step 2: Run adapter tests red**

Run:

```bash
npm test -- src/platform/gh.test.ts
```

Expected: FAIL because the adapter does not exist yet.

- [ ] **Step 3: Implement adapter**

Use `@tauri-apps/plugin-shell` from production code, but inject an executor in tests so no real `gh` process is needed.

- [ ] **Step 4: Run adapter tests green**

Run:

```bash
npm test -- src/platform/gh.test.ts
```

Expected: PASS.

## Task 4: Watch Controller And UI

**Files:**
- Create: `src/app/watchController.ts`
- Create: `src/app/watchController.test.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Create: `src/platform/notifications.ts`
- Create: `src/platform/store.ts`

- [ ] **Step 1: Write failing controller tests**

Cover:
- adding a watch fetches baseline state without notifying
- polling emits notification only on status changes
- removing a watch stops future polls
- completed watches stop polling

- [ ] **Step 2: Run controller tests red**

Run:

```bash
npm test -- src/app/watchController.test.ts
```

Expected: FAIL because the controller does not exist yet.

- [ ] **Step 3: Implement controller**

Implement a small polling controller with injectable clock, GitHub adapter, persistence, and notification interfaces.

- [ ] **Step 4: Run controller tests green**

Run:

```bash
npm test -- src/app/watchController.test.ts
```

Expected: PASS.

- [ ] **Step 5: Implement popup UI**

Add:
- status indicator area
- `+` add flow with paste input
- current watch list
- `x` remove buttons
- per-watch open-in-browser action
- dependency/auth error messages

- [ ] **Step 6: Wire notifications and persistence**

Request notification permission when needed, store watch metadata in app data, and reload watches on startup.

## Task 5: Verification

**Files:**
- All created files

- [ ] **Step 1: Run unit tests**

Run:

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: TypeScript exits successfully.

- [ ] **Step 3: Build Tauri app**

Run:

```bash
npm run tauri build
```

Expected: Tauri app bundle builds successfully, or reports a concrete environment prerequisite.

- [ ] **Step 4: Manual macOS smoke test**

Run:

```bash
npm run tauri dev
```

Expected:
- tray/menu bar icon appears
- popup opens from tray
- pasting a GitHub Actions run/job link adds a watch
- removing a watch updates the list
- notifications appear when a watched status changes

## Self-Review

- Spec coverage: covers tray icon, popup add flow, watch list, remove action, status indicator, desktop notifications, `gh` dependency, and persistence.
- Placeholder scan: no deferred implementation placeholders remain.
- Type consistency: parsed targets, normalized statuses, and watch records are intentionally separated so tests can cover each boundary.
