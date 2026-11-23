# Backup

Everything that is yours lives in the **`data`** folder next to the program (next to `Workspace.exe` on Windows, `workspace` on Linux). The program itself can be downloaded again at any time, so **back up `data/`, and nothing else is needed.**

## What to back up

```
data/
  features/        what each feature means          ← back up
  projects/        one folder per project           ← back up (the important part, archived projects too)
  templates/       your project templates            ← back up
  settings.yaml    workspace settings                ← back up
  .secrets.json    your secrets, encrypted           ← back up (see below)
  .workspace.json  update state, installed features  ← optional
  .desktop.json    tray / reminders / autostart      ← optional
  .window.json     window size                       ← not needed
  .app/            left over from 0.x                ← see below (only if you came from 0.x)
  .ide-token       VS Code's login token             ← not needed
```

The program folder itself (`Workspace.exe`, `app/`, `.update/`) is **not** needed — download it again.

Inside a project, `.trash/` holds deleted items. Keep it if you want to be able to restore them later.

**Projects with `location:`** keep their content in another folder (e.g. a git clone). Back up that folder too, or let git take care of it.

## How

- **Copy** the `data` folder to another drive, a NAS or a USB stick. Close the app first, so no file is half-written.
- **Sync** it with OneDrive, Dropbox or Nextcloud: put the whole program folder (or just `data`, see `WORKSPACE_DIR` on [[Data and Updates|Data-and-Updates]]) into the synced folder. Don't edit the same project on two computers at the same time.
- **Version it** with git if you like: `data/` is plain text (Markdown, YAML) plus your pictures and files. Add `.ide-token` and `.window.json` to `.gitignore` (and `.app/` if you have it).
- **Windows File History** or any backup tool that copies folders works too.

## Restore

1. Unzip the program (same or newer version).
2. Put your backed-up `data` folder next to it, replacing the empty one.
3. Start the app. Everything is back.

## Secrets after a restore

Secrets are encrypted. In the desktop app the key is protected by Windows (or the operating system) **for your user on that computer**:

- **Same computer, same user:** they just work.
- **Another computer or user:** the app can't read them and says so under **Secrets**. Click *Remove all secrets* and enter them again. Your YAML files keep working, because they refer to secrets by name (`${secret:github-token}`).

**Came from 0.x?** Secrets saved by the old 0.x app need its key in `data/.app/` on Windows. The first time 1.0 uses your
secrets (just open **Secrets** once), it protects them its own way — after that `.app/` is not needed any more. Until then,
keep `.app/` in the backup.

That is on purpose: a copied `data` folder doesn't give away your keys. Keep the keys themselves in your password manager.

See also: [[Data and Updates|Data-and-Updates]], [[Import and Export|Import-and-Export]].
