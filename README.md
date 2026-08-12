# GHA Watch

A minimal tray watcher for GitHub Actions checks.

GHA Watch sits in the macOS menu bar, Windows notification area, or Linux system tray, watches GitHub Actions workflow runs, jobs, or pull requests through the GitHub CLI, and sends native desktop notifications when status changes.

## Features

- Add a repository URL or slug to watch your open pull requests immediately.
- Watch a workflow run URL, a specific job URL, or a pull request URL.
- Live pull request watches follow the latest PR head and show the current workflow runs.
- Track pull requests as draft, ready, merged, or closed using GitHub's lifecycle icons and colors.
- Group watches by repository, pull request, and workflow with collapsible tree sections.
- Watch repositories so they stay visible after their watches are cleared.
- Configure all or user-specific pull request watches alongside branch, event, and actor-filtered workflow watches from the repository eye menu.
- Sync watched repositories, repository order, and Saved/Done items across machines through an automatically discovered unlisted GitHub Gist.
- Long-press repository headers to reorder visible repositories.
- Load a repository's open pull requests or active workflow runs on demand and start watching from the menu.
- Show queued, in-progress, successful, failed, cancelled, and errored states.
- Mark unseen status changes with a blue indicator.
- Re-run all jobs or only failed jobs for workflow runs and pull requests.
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

## Workflow subscriptions

Open a repository's eye menu and choose **Add** next to a workflow. Each workflow can have multiple independent subscriptions:

- **Default** matches runs whose head branch is the repository's current default branch.
- **Any** accepts any head branch, while **Exact** matches the entered branch name literally. Branch globs and regular expressions are not supported.
- Select one or more GitHub Actions events such as `push`, `pull_request`, `workflow_dispatch`, or `schedule`. **Any** accepts every event. Other GitHub event names can be entered as a comma-separated list.
- **Anyone** accepts every run actor. **Current user** compares the run's GitHub actor with the account authenticated in `gh`.

For example, a workflow can be watched for pushes on `release/1.x`, scheduled runs on the default branch, and manual runs by the current user as three separate subscriptions. A run matching more than one subscription appears only once. Previously cleared runs remain suppressed instead of reopening on the next scan.

After a repository's first subscription scan establishes a baseline, later scans also check runs created since the preceding successful scan. This catches short workflows that start and finish between polls, including after a temporary connection failure or system sleep while the app remains running. Catch-up scans use overlapping, fixed creation-time intervals and process at most 300 runs per poll. Larger intervals resume on the next poll, and the cursor advances only after the whole interval has been processed.

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
