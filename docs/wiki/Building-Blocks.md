# Building blocks

A feature is a combination of **what it stores** and **how it looks**. Everything is saved as plain files.

| Layout | Stores | Saved as | What you get |
|---|---|---|---|
| **pages** | markdown | `<folder>/<page>.md` | Page list with full-text search, editor with live preview, `[[links]]`, Mermaid diagrams in pages, paste or drop pictures |
| **cards** | markdown / records | `.md` / `.yaml` | Cards with summary and tags, tag filter |
| **list** | markdown / records | `.md` / `.yaml` | Simple list |
| **journal** | markdown | `.md` with `date:` | Entries by year and month, newest first — [[Journal|Layout-Journal]] |
| **book** | markdown | `.md` | Ebook: contents, one page, text size, full screen — [[Book|Layout-Book]] |
| **notes** | markdown | `.md` with `color:` | Sticky notes in six colours — [[Sticky notes|Layout-Sticky-notes]] |
| **board** | markdown | `.md` with `status:` | Kanban for pages — [[Board|Layout-Board]] |
| **table** | markdown | `.md` | Pages as a table, edit a cell in place — [[Table|Layout-Table]] |
| **blog** | markdown | `.md` with `date:` | Pages one after another, newest first — [[Blog|Layout-Blog]] |
| **grid** | images | `<folder>/<album>/*.jpg…` (also videos and audio) | Albums with covers, sort by date/name/size, group by album/month/year, photo dates from EXIF, lightbox |
| **files** | files | any files | Folders, upload, download |
| **code** | files | any text files | Explorer with code editor (syntax colours), script templates, Open in VS Code |
| **table** | records | `<folder>/<item>.yaml` | Sortable, filterable table |
| **kanban** | records | `.yaml` | Columns, drag cards between them |
| **calendar** | records | `.yaml` | Month view, multi-day events, coming up |
| **orgchart** | records | `.yaml` | Tree from `reports_to` |
| **map** | records | `.yaml` + `_map.png` | Your own picture (floor plan, site plan) with draggable pins; works offline |
| **diagram** | diagram | `<folder>/<name>.mmd` | Mermaid text with live preview, SVG download |
| **issues** | github | nothing (read from GitHub or Forgejo) | Issues of a repository: open/closed, labels, search, read inline, *New issue*. Set `repo: owner/name` in the project — [[Issues|Feature-Issues]] |
| **tickets** | glpi | nothing (read from GLPI) | Tickets of the project in GLPI 11 — [[Ticket|Feature-Ticket]] |
| **comfyui** | comfyui | `comfyui/workflows/`, results in the Gallery | Run ComfyUI workflows, keep the results — [[ComfyUI|Feature-ComfyUI]] |
| **vcs** | vcs | `.version-control/` (Git copy) | Files and history of a Git or SVN repository, read only — [[Version Control|Feature-Version-Control]] |
| **chat** | chat | `chats/<date>-<title>.json` | Chat with Claude CLI or LM Studio in the project folder (see [[Claude]], [[Chat|Feature-Chat]]) |

| | |
|---|---|
| ![Wiki](https://raw.githubusercontent.com/GFGMNET/Workspace/main/docs/screenshots/wiki.png) | ![Kanban](https://raw.githubusercontent.com/GFGMNET/Workspace/main/docs/screenshots/kanban.png) |
| ![Map](https://raw.githubusercontent.com/GFGMNET/Workspace/main/docs/screenshots/map.png) | ![Org chart](https://raw.githubusercontent.com/GFGMNET/Workspace/main/docs/screenshots/orgchart.png) |
| ![Calendar](https://raw.githubusercontent.com/GFGMNET/Workspace/main/docs/screenshots/calendar.png) | ![Diagram](https://raw.githubusercontent.com/GFGMNET/Workspace/main/docs/screenshots/diagram-dark.png) |

## Links between features

- **In pages:** `[[Router]]` links to the item with that title in any feature, looking in the same feature first. `[[devices/router]]` names it exactly, and `[[Router|the router]]` changes the text shown.
- **In records:** a `link` field picks pages or records with a type-ahead box, and shows them as clickable chips.
- **Mentioned in:** every page and record lists what links to it.

## Overview

Every project opens on an **Overview** with:
- its own **dashboard** (click **Edit** to add blocks — see [[Dashboard]])
- a tile per feature with its count
- *coming up* in the next 30 days (from every date field)
- open Kanban tasks, with overdue ones in red
- recently changed items
