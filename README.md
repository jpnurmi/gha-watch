# GHA Watch

A minimal tray watcher for GitHub Actions checks.

GHA Watch sits in the macOS menu bar or Linux system tray, watches GitHub Actions workflow runs, jobs, or pull requests through the GitHub CLI, and sends native desktop notifications when status changes.

## Features

- Watch a workflow run URL, a specific job URL, or a pull request URL.
- Live pull request watches follow the latest PR head and show the current workflow runs.
- Group watches by repository.
- Show queued, in-progress, successful, failed, cancelled, and errored states.
- Mark unseen status changes with a blue indicator.
- Re-run failed workflow runs through `gh run rerun --failed`.
- Clear finished watches or clear all watches from the menu.
- Open watched runs or jobs in GitHub.

## Requirements

- macOS or Linux with a desktop environment that supports status notifier tray icons.
- GitHub CLI installed as `gh`.
- An authenticated GitHub CLI session:

```sh
gh auth login
```

On Linux, tray and notification behavior depends on the desktop environment, notification daemon, and status notifier support.

## Supported Links

Paste any of these into the add field:

```text
https://github.com/OWNER/REPO/actions/runs/RUN_ID
https://github.com/OWNER/REPO/actions/runs/RUN_ID/job/JOB_ID
https://github.com/OWNER/REPO/runs/JOB_ID
https://github.com/OWNER/REPO/pull/PR_NUMBER
```

Pull request links are live watches. On each poll, the app resolves the current PR head and watches the matching workflow runs for that head.

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

## License

MIT. See [LICENSE](LICENSE).
