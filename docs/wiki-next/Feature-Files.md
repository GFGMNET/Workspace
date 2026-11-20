# Files

Any documents — PDF, Office files, archives — in folders, with upload, download and delete.

## What you need

- Nothing extra: works offline, files stay in the project folder.

| | |
|---|---|
| Stores | `files` |
| Layout | `files` |
| Definition | `data/features/files.yaml` |

## Add it to a project

```yaml
files:
  - Contracts      # a folder, created once
  - Manuals
```

Or click **+ Feature** in the project's tab row.

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Any documents (PDF, Office, ...) in folders.
name: Files
icon: folder
stores: files
layout: files
new_item: Folder
```

## Settings

Every setting can also be set **for one project only**, under the feature key in that project's `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue | by layout |
| `folder` | Folder inside the project where the content goes | the key |
| `search` | Show the search box | false |
| `new_item` | Label of the **+ New** button | Folder |
| `aliases` | Other keys in project.yaml that mean this feature | none |
| `layout` | `files` (folders and files) or `code` (explorer with code editor) | `files` |

## On disk

```
projects/<project>/files/
  contracts/
    contract-2026.pdf
  manuals/
```

## Tips

- Every project also has an **Explorer** tab with *all* its files.

See also: [[Features]] · [[Building Blocks|Building-Blocks]] · [[Projects]]
