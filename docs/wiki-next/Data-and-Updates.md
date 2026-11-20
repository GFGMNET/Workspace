# Data and updates

## Where your data lives

```
Workspace/          ← the program: replaced on update
  Workspace.exe  workspace-server.exe  app/      (Linux: workspace, workspace-server)
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
1. downloads the new version for your system and checks it: on Windows it must be signed with the project's own certificate "Workspace" and unchanged ([[Signing certificate|Signing-certificate]]), on Linux it must match the checksum list of the release — otherwise nothing is installed
2. moves the old program into `.update/backup-…`
3. installs the new one
4. restarts

`data/` is never touched, and if anything goes wrong the old version is put back. **v… · Updates** in the sidebar checks right away. Turn the weekly check off in `data/settings.yaml`:

```yaml
updates:
  check: false
```

**By hand:**
1. Download the new version from the [releases page](https://github.com/GFGMNET/Workspace/releases) (the zip for your system).
2. Replace everything **except `data/`**.
3. Start as usual.

On start, starter features that are new in this version are added. Each one is added only once, so features you changed or deleted are left alone.

## Coming from 0.x

See [[Moving to 1.0|Moving-to-1.0]].

## Settings

| Setting | How | Default |
|---|---|---|
| Port | `PORT` environment variable, or start with a port number (`Workspace.exe 4322`) | 4321 |
| Data folder | `WORKSPACE_DIR` | `data/` |
| Claude CLI command | `CLAUDE_COMMAND` | `claude` |
| VS Code command | `VSCODE_COMMAND` | `code` |
| In-app VS Code | `data/settings.yaml` → `ide:` (keep the values in quotes) | `code serve-web` on port 8740 |
| GitHub token (private repositories) | `data/settings.yaml` → `github: token: ${secret:github-token}` | none |
| Tray, reminders, start with Windows | tray icon menu (desktop app), stored in `data/.desktop.json` | tray and reminders on, autostart off |
| Update check | `data/settings.yaml` → `updates: check:` / `repo:` | weekly, GFGMNET/Workspace |
