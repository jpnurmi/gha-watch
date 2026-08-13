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
- Configure all or user-specific pull request watches alongside workflow watches from the repository eye menu.
- Sync watched repositories, repository order, and Saved/Done items across machines through an automatically discovered unlisted GitHub Gist.
- Long-press repository headers to reorder visible repositories.
- Reorder repositories and watch groups from the keyboard.
- Add a validated GitHub link from the clipboard, optionally with a configurable global shortcut.
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

## Keyboard shortcuts

Keyboard shortcuts work while the tray popup has focus, except for the optional global shortcut. Local shortcuts are ignored while typing in an input, text area, select, or editable field.

- `A`: open the Add form.
- `R`: refresh GitHub status.
- `1`, `2`, `3`: select Inbox, Saved, or Done.
- `Left` / `Right`: select the previous or next triage tab; expand or collapse a focused repository/tree group.
- `Up` / `Down`: move through an open menu.
- `Alt+Shift+Up` / `Alt+Shift+Down`: move the focused repository or watch group and announce its new position.
- `Escape`: cancel a reorder, close the innermost menu, close Add, then hide the popup.
- `/`: focus search when a search control is available.

Use **More → Add from clipboard** to read the clipboard once and validate its plain text through the same parser as the Add form. GHA Watch never writes to the clipboard and never opens or executes clipboard text before validation.

The optional global add shortcut is disabled by default. Enable it under **More → Global add shortcut**, edit the accelerator, and choose **Apply**. The default is `CommandOrControl+Shift+G`. If another application owns the accelerator, registration remains disabled and the menu shows the error; GHA Watch does not replace the other application's shortcut.

Global shortcut and clipboard behavior can vary by desktop environment, especially under Linux/Wayland. Clipboard permission denials and unsupported or conflicting global accelerators leave the normal Add form and **Add from clipboard** fallback available.

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
