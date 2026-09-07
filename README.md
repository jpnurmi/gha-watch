# GHA Watch

A minimal tray watcher for GitHub Actions checks.

GHA Watch sits in the macOS menu bar, Windows notification area, or Linux system tray, watches GitHub Actions workflow runs, jobs, or pull requests through the GitHub CLI, and sends native desktop notifications when status changes.

## Features

- Add a repository URL or slug to watch your open pull requests immediately.
- Discover your open pull requests in unlisted repositories from the add panel.
- Watch a workflow run URL, a specific job URL, or a pull request URL.
- Live pull request watches follow the latest PR head and show the current workflow runs.
- Track pull requests as draft, ready, merged, or closed using GitHub's lifecycle icons and colors.
- Group flat watch rows by repository with collapsible repository sections.
- Watch repositories so they stay visible after their watches are cleared.
- Configure pull request watches and workflow branch rules from the repository eye menu.
- Target workflow runs on the default branch, your own manual dispatches, every branch, or case-sensitive include/exclude patterns such as `release/*`.
- Catch up subscribed workflow runs that finish while the app is closed, asleep, or offline.
- Sync watched repositories, repository order, and Saved/Done items across machines through an automatically discovered unlisted GitHub Gist.
- Long-press repository headers to reorder visible repositories.
- Load a repository's open pull requests or active workflow runs on demand and start watching from the menu.
- Show queued, in-progress, successful, failed, cancelled, and errored states.
- Mark unseen status changes with a blue indicator.
- Re-run all jobs or only failed jobs for workflow runs and pull requests.
- Open in GitHub, finish, or re-run directly from completion notifications when the desktop supports notification actions.
- Clear finished watches or clear all watches from the menu.
- Automatically retain Done history for one month, capped at the 100 newest items.
- Open watched runs or jobs in GitHub.

## Requirements

- macOS, Windows, or Linux with a desktop environment that supports tray icons.
- GitHub CLI installed as `gh`.
- An authenticated GitHub CLI session:

```sh
gh auth login
```

Clicking a notification shows the GHA Watch popup; the Open action opens the watched item in GitHub. Notification action placement varies by platform: macOS may place actions in a menu, Windows exposes toast buttons, and Linux actions depend on the notification daemon's capabilities. The same actions remain available in the popup when a desktop does not display them.

On Windows and Linux, tray and notification behavior depends on the desktop environment, notification daemon, and tray support.

## Supported Links

Paste any of these into the add field:

```text
https://github.com/OWNER/REPO/actions/runs/RUN_ID
https://github.com/OWNER/REPO/actions/runs/RUN_ID/job/JOB_ID
https://github.com/OWNER/REPO/runs/JOB_ID
https://github.com/OWNER/REPO/pull/PR_NUMBER
https://github.com/OWNER/REPO
OWNER/REPO
REPO
OWNER/REPO#PR_NUMBER
REPO#PR_NUMBER
```

Repository links and `OWNER/REPO` slugs watch your open pull requests and keep the repository visible without adding an individual Actions watch.
Ownerless repository names use the authenticated GitHub CLI user as the owner.
Pull request links are live watches. On each poll, the app resolves the current PR head and watches the matching workflow runs for that head.
Ownerless pull request slugs use the authenticated GitHub CLI user as the owner.

## Workflow catch-up

Workflow branch patterns match the complete branch name. `*` matches any sequence of characters, including `/`, so `release/*` also matches nested names such as `release/1.2/hotfix`. A run must match at least one inclusion target and no exclusion target selected for its workflow. The Own target watches manually dispatched runs triggered by the authenticated GitHub user.

When a pull-request or workflow subscription is enabled for a repository, GHA Watch establishes a baseline at that moment and adds only currently active matches. Changing the configured PR scope, branch rules, or workflow selections establishes a fresh baseline, so newly enabled subscriptions do not import older completed runs.

Later polls scan runs created since the repository's last successful scan, including completed runs and their referenced pull requests. This catches PRs that open and close entirely while the app is offline. A five-minute overlap protects polling and persistence boundaries; stable GitHub run IDs prevent duplicate watches and notifications. Caught-up results remain unseen in Inbox even when the popup is focused and desktop notifications are paused.

Catch-up is device-local and is not included in Gist sync. For each repository, catch-up processes the full offline gap in chronological windows, each covering up to 24 hours and containing up to 1,000 workflow runs. Each poll processes at most seven windows per repository and leaves any remaining interval for later polls. The cursor advances after each completed window. If that window’s run limit is exceeded or any page fails, GHA Watch retains the last completed window’s cursor and retries the remaining interval on the next poll.

## Development

Install dependencies:

```sh
npm install
```

Run the web UI during development:

```sh
npm run dev
```

Run checks:

```sh
npm run typecheck
npm test -- --run
```

Build the release app bundle:

```sh
npm run tauri build
```

The macOS app bundle is written to:

```text
src-tauri/target/release/bundle/macos/GHA Watch.app
```

On Linux, the AppImage, Debian, and RPM packages are written under:

```text
src-tauri/target/release/bundle/
```

On Windows, the NSIS and MSI installers are written under:

```text
src-tauri/target/release/bundle/
```

## License

MIT. See [LICENSE](LICENSE).
