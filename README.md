# GHA Watch

A minimal tray watcher for GitHub Actions checks.

GHA Watch sits in the macOS menu bar, Windows notification area, or Linux system tray, watches GitHub Actions workflow runs, jobs, or pull requests through the GitHub CLI, and sends native desktop notifications when status changes.

## Features

- Add a repository URL or slug to favorite it immediately.
- Watch a workflow run URL, a specific job URL, or a pull request URL.
- Live pull request watches follow the latest PR head and show the current workflow runs.
- Group watches by repository, pull request, and workflow with collapsible tree sections.
- Favorite repositories so they stay visible after their watches are cleared.
- Long-press repository headers to reorder visible repositories.
- Load a repository's open pull requests or active workflow runs on demand and start watching from the menu.
- Show queued, in-progress, successful, failed, cancelled, and errored states.
- Mark unseen status changes with a blue indicator.
- Re-run failed workflow runs through `gh run rerun --failed`.
- Clear finished watches or clear all watches from the menu.
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

Repository links and `OWNER/REPO` slugs create favorite repositories without adding a watch.
Ownerless repository names use the authenticated GitHub CLI user as the owner.
Pull request links are live watches. On each poll, the app resolves the current PR head and watches the matching workflow runs for that head.
Ownerless pull request slugs use the authenticated GitHub CLI user as the owner.

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
