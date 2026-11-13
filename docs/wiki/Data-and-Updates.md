# Data and updates

## Where your data lives

```
Workspace/          ← the program: replaced on update
  app/  docs/  start.bat  start.sh
  data/             ← YOUR data: never replaced
    features/       what each feature means
    projects/       one folder per project
    settings.yaml   workspace settings
```

- **Back up only `data/`.** It's plain files, so you can copy it, sync it with OneDrive, or put it on a USB stick.
- **To keep the data somewhere else,** start with the environment variable `WORKSPACE_DIR` pointing to that folder.
- **Deleted items** go to a `.trash` folder inside the project (or the workspace) instead of being removed.

## Updating

1. Download the new version from GitHub (release zip or **Code → Download ZIP**).
2. Replace everything **except `data/`**.
3. Start as usual.

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
| In-app VS Code | `data/settings.yaml` → `ide:` | `code serve-web` on port 8740 |
