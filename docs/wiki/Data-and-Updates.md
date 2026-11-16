# Data and updates

## Where your data lives

```
Workspace/          ← the program: replaced on update
  app/  docs/  start.bat  start.sh
  data/             ← YOUR data: never replaced
    features/       what each feature means
    projects/       one folder per project
    templates/      project templates
    settings.yaml   workspace settings
    .secrets.json   secrets, encrypted (see [[Secrets]])
```

- **Back up only `data/`.** It's plain files, so you can copy it, sync it with OneDrive, or put it on a USB stick. Details: [[Backup]].
- **To keep the data somewhere else,** start with the environment variable `WORKSPACE_DIR` pointing to that folder.
- **Deleted items** go to a `.trash` folder inside the project (or the workspace) instead of being removed.

## Updating

**Automatic:** the workspace checks GitHub once a week. When a new version is out, a bar appears at the top: **What's new** · **Update now** · **Later** · **Skip this version**. *Update now*:
1. downloads the new version for your system
2. checks the maintainer's signature, so only genuine releases are installed (from v0.6.2; see [[Security]])
3. moves the old program into `.update/backup-…`
4. installs the new one
5. restarts

`data/` is never touched, and if anything goes wrong the old version is put back. **v… · Updates** in the sidebar checks right away. Turn the weekly check off in `data/settings.yaml`:

```yaml
updates:
  check: false
```

**By hand:**
1. Download the new version from the [releases page](https://github.com/GFGMNET/Workspace/releases) (the zip for your system).
2. Replace everything **except `data/`**.
3. Start as usual.

> If the update says *start.bat changed*, the new launcher was saved as `start.bat.new`. Close the workspace and rename it to `start.bat`.

On start, starter features that are new in this version are added. Each one is added only once, so features you changed or deleted are left alone.

## Coming from version 0.1

Version 0.1 kept `features/` and `projects/` next to `app/`. Newer versions move them into `data/` automatically on the first start.

## Settings

| Setting | How | Default |
|---|---|---|
| Port | `PORT` environment variable, or `node app/server.js 4322` | 4321 |
| Data folder | `WORKSPACE_DIR` | `data/` |
| Claude CLI command | `CLAUDE_COMMAND` | `claude` |
| VS Code command | `VSCODE_COMMAND` | `code` |
| In-app VS Code | `data/settings.yaml` → `ide:` (keep the values in quotes) | `code serve-web` on port 8740 |
| GitHub token (private repositories) | `data/settings.yaml` → `github: token: ${secret:github-token}` | none |
| Tray, reminders, start with Windows | tray icon menu (desktop app), stored in `data/.desktop.json` | tray and reminders on, autostart off |
| Update check | `data/settings.yaml` → `updates: check:` / `repo:` | weekly, GFGMNET/Workspace |
