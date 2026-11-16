# Scripts

Script files with a code editor: syntax colours, line numbers, Tab indents, Ctrl+S saves. **+ Script** starts from a template; **Open in VS Code** opens a script in the full VS Code.

| | |
|---|---|
| Stores | `files` |
| Layout | `code` |
| Definition | `data/features/scripts.yaml` |

## Add it to a project

```yaml
scripts:
# or another folder, e.g. an existing tools folder:
# scripts: { folder: tools }
```

Or click **+ Feature** in the project's tab row.

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Scripts with a code editor (PowerShell, batch, Bash, Python, ...). Each script is a normal file;
# "Open in VS Code" opens it in the full editor.
name: Scripts
icon: terminal
stores: files
layout: code
new_item: Script
```

## Settings

Every setting can also be set **for one project only**, under the feature key in that project's `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue | by layout |
| `folder` | Folder inside the project where the content goes | the key |
| `search` | Show the search box | false |
| `new_item` | Label of the **+ New** button | Script |
| `aliases` | Other keys in project.yaml that mean this feature | none |

## Templates

**+ Script** asks for a name and a type and starts from a small template: PowerShell (`.ps1`), batch (`.bat`), Bash (`.sh`), Python (`.py`), JavaScript (`.js`), SQL (`.sql`), Markdown or text. Any other file name works too — the editor colours it by its extension.

Running scripts from the app isn't built in; use the terminal in the **VS Code** tab.

## On disk

```
projects/<project>/scripts/
  backup-nas.ps1
  cleanup.py
```

See also: [[Features]] · [[Building Blocks|Building-Blocks]] · [[Projects]]
