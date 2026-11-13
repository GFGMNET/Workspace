# Project Workspace: Design

This document describes what the workspace is, how it is built, and why. It has enough detail to rebuild it from scratch or port it to another stack.

Status: version 0.1 (first working version). Open work is tracked in [GitHub Issues](https://github.com/GFGMNET/Workspace/issues).

---

## 1. Goal

One workspace for very different projects. Each project page is built from a YAML file, and there is no database: everything is plain files that can be copied anywhere.

Principles:

- **Files only.** Projects, content and settings are folders, YAML and Markdown. Copying the folder to a USB stick or OneDrive keeps everything working.
- **YAML decides.** A project lists *which* features it has. The workspace defines *what* each feature means.
- **Extensible without code.** New feature types are new YAML files, not app updates.
- **Built for Claude CLI.** Claude can work inside any project (chat, skills, MCP) and can manage the whole workspace through an MCP server.
- **Graphical interface,** with light and dark mode.

## 2. Folder structure

```
Workspace/                   ← the program: replace it completely on update
  app/
    server.js                local web server + API
    mcp.js                   MCP server for Claude CLI
    lib/yaml.js              small YAML reader/writer
    lib/exif.js              reads the "date taken" from photos
    lib/workspace.js         all file logic (features, projects, items, first start)
    lib/chat.js              runs Claude CLI for the chat feature
    public/                  the user interface (HTML/CSS/JS)
      vendor/mermaid.min.js  Mermaid 11 (MIT) for diagrams, bundled for offline use
    starter/features/        starter feature definitions (copied into data/ on first start)
    starter/examples/        example projects (added on request)
    test/smoke.js            automated checks (npm test)
  docs/                      this document, screenshots
  start.bat / start.sh       start the app
  data/                      ← the client's data: never replaced, not in git
    .workspace.json          which starter features were installed (so deleted ones stay deleted)
    features/                what each feature means — one YAML file per feature
    projects/                one folder per project
      <project>/
        project.yaml         which features this project has
        <feature folder>/... the content
        .claude/skills/...   written by the skills feature (read by Claude CLI)
        .mcp.json            written by the mcp feature (read by Claude CLI)
        .trash/              deleted items end up here (never really deleted)
```

**Program and data are separate.** The GitHub repository is only for developing the tool. A live installation never touches git: a new version is downloaded and replaces everything except `data/`.

- **First start:** `data/` is created and the starter features are copied in. Example projects are only added when you click *Add the example projects* on the empty home page.
- **Update:** starter features that are new in that version are added. A starter feature is only ever added once (tracked in `.workspace.json`), so features the client changed or deleted are never touched.
- **Old layout:** v0.1 kept `features/` and `projects/` next to `app/`; these are moved into `data/` automatically on the first start of a newer version.

Set the `WORKSPACE_DIR` environment variable to keep the data somewhere else (for example on a network drive or in OneDrive).

## 3. Projects: `project.yaml`

A project's `project.yaml` names the project and lists its features. Every feature key becomes a tab on the project page, in the order written.

```yaml
name: test 2
description: Agent project          # optional
icon: "🏠"                           # optional, emoji or letter
color: "#b4501a"                     # optional
tags: [network, example]             # optional
status: active                       # optional
wiki:                                # feature with no starting items
knowledge:
  - a knowledge base                 # starting item (created as a file)
mcp:
  - name: filesystem                 # starting record with fields
    command: npx
    args: [-y, "@modelcontextprotocol/server-filesystem", "."]
chat:
  permissions: ask                   # overrides the feature's default for this project
photos:
  feature: gallery                   # a second gallery under another key
```

Rules:

| Key value | Meaning |
|---|---|
| `name`, `description`, `icon`, `color`, `tags`, `status`, `owner`, `created` | Project information, not features |
| `overview: false` | Hides the built-in Overview tab |
| a list | Starting items. Each one is created as a file when the project is saved; existing files are never overwritten |
| a mapping | Settings that override the feature definition for this project only. `items:` holds starting items, `feature:` points to another feature definition |
| empty | Just adds the feature |

- **The folder is the source of truth.** Items that exist on disk appear even if they are not listed in `project.yaml`, so you can drop a `.md` file or a picture into the folder and it shows up.
- **The app changes `project.yaml` only by appending** (when you add a feature), so comments and formatting stay intact. The exception is removing a feature, which deletes that key's block.
- **An unknown feature key** shows a notice with a button to create that feature.

## 4. Features: `data/features/<key>.yaml`

A feature definition (`data/features/<key>.yaml`) says what a feature stores and how it looks. Every project that names it gets the same behaviour, and changing the file changes it everywhere.

```yaml
# Kanban board. Cards are records; the column is the "status" field.   ← first comment = description in the UI
name: Tasks
icon: kanban
stores: records
layout: kanban
columns: [To do, Doing, Done]
fields:
  - title
  - owner
  - name: due
    type: date
  - name: priority
    type: select
    options: [low, normal, high]
new_item: Task
aliases: [todo]          # other keys in project.yaml that mean this feature
```

### All settings

| Setting | Values | Default |
|---|---|---|
| `name` | Display name | key, prettified |
| `icon` | book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file | by layout |
| `stores` | `markdown`, `images`, `files`, `records`, `diagram`, `chat` | `markdown` |
| `layout` | see building blocks | first layout of the store |
| `folder` | where content goes inside a project | the key (skills: `.claude/skills`, chat: `chats`) |
| `search` | `true` / `false` | true for markdown, records, diagram |
| `new_item` | label of the "+ New" button | by store |
| `aliases` | other project.yaml keys that mean this feature | none |
| `fields` | records only: list of `name` or `{name, type, label, options}` | `[title]` |
| `title_field` | records: which field is the title | first field |
| `columns`, `status_field` | kanban | `[To do, Doing, Done]`, `status` |
| `date_field`, `end_field` | calendar | first date field, `end` if present |
| `parent_field` | orgchart | `reports_to` |
| `albums` | images: sub folders as albums | true |
| `for_claude` | `skills` (writes `.claude/skills/<name>/SKILL.md`) or `mcp` (writes `.mcp.json`) | none |
| `permissions` | chat: `ask`, `auto`, `read-only` | `ask` |
| `allowed_tools` | chat: tools always allowed, e.g. `[Read, Grep]` | none |
| `context` | chat: feature keys Claude should look at first | none |
| `instructions` | chat: extra instructions sent with the first message | none |
| `model` | chat: Claude model alias | CLI default |

Field types: `text`, `longtext`, `number`, `date`, `datetime`, `select` (with `options`), `bool`, `url`, `email`, `tags`, `list`, `keyvalue`. If no type is given, it is guessed from the name (`due` becomes a date, `email` an email, `notes` a longtext, and so on).

### Adding features

1. **In the app:** Features, then New feature (pick what it stores, the layout and the fields).
2. **By hand:** copy a YAML file in `features/` and change it.
3. **With Claude:** "add a feature Contacts with name, phone and company as a table" (through the MCP server's `save_feature` tool).

A feature can combine only the building blocks below. A truly new look (a new building block) is an app change.

## 5. Building blocks (storage × layout)

| Layout | Stores | On disk | What you see |
|---|---|---|---|
| `pages` | markdown | `<folder>/<id>.md` | Page list with full-text search, Markdown view, editor with live preview, `[[Page]]` links (a link to a missing page creates it), Mermaid code blocks |
| `cards` | markdown | `<folder>/<id>.md` (tags in front matter) | Cards with summary and tags, search and tag filter |
| `list` | markdown / records | as above | Simple list |
| `grid` | images | `<folder>/<album>/*.png…` | Album cards (cover, count, date range), drag & drop upload, lightbox (arrow keys, Del moves to trash). Sort by date (newest/oldest), name or size; group by album, month or year; “All albums” shows every picture at once. Dates are the photo's EXIF *date taken* (JPEG), else the file date. Sort/group are remembered per gallery |
| `files` | files | `<folder>/<subfolder>/*` | Folder browser with upload |
| `table` | records | `<folder>/<id>.yaml` | Sortable, filterable table; click a row to edit |
| `cards` | records | `<folder>/<id>.yaml` | Cards showing the fields (the MCP feature also shows the generated `.mcp.json`) |
| `kanban` | records | `<folder>/<id>.yaml` | Columns from `columns:`; drag cards between them (this changes the status field) |
| `calendar` | records | `<folder>/<id>.yaml` | Month view (Monday first), multi-day events, upcoming list; click a day to add |
| `orgchart` | records | `<folder>/<id>.yaml` | Tree built from `reports_to` (by id or by name) |
| `map` | records | `<folder>/<id>.yaml` with `x`, `y` in % + `<folder>/_map.<ext>` | Your own image (floor plan, site plan) with draggable pins; works offline |
| `diagram` | diagram | `<folder>/<id>.mmd` (first line `%% Title`) | Mermaid text with live preview, SVG download |
| `chat` | chat | `<folder>/<date>-<title>.json` | Chat with Claude CLI inside the project folder (section 6) |

Records are one YAML file per item, so they are readable, diff-friendly in git, and easy for Claude to edit.

## 6. Claude CLI integration

Claude always works inside the project's own folder, so it sees that project's files, skills and MCP connections and nothing else.

### Chat feature

For each message the server runs:

```
claude -p --output-format stream-json --verbose --include-partial-messages
       [--resume <session>] [--model <m>] [--mcp-config .mcp.json] <permission flags>
```

- The working directory is the project folder, and the message is sent on stdin, so no shell quoting is involved.
- The streamed JSON events (text deltas, tool use, tool results, the final result) are forwarded to the browser as server-sent events.
- The session ID is saved in the chat file, so each later message continues the same conversation (`--resume`).
- `--mcp-config .mcp.json` is passed explicitly because headless runs skip the "trust project MCP servers" prompt.

Permissions are set per project in `project.yaml` (`chat: { permissions: … }`):

| Mode | Claude CLI flags | Behaviour |
|---|---|---|
| `ask` | default permission mode (+ tools allowed so far in this chat) | When Claude needs a tool that isn't allowed, the run ends with `permission_denials`. The UI shows "Claude asked for permission", and **Allow and continue** resumes the session with `--allowedTools <tool>`. Allowed tools stay allowed in that chat |
| `auto` | `--permission-mode acceptEdits` | Claude may change files directly |
| `read-only` | `--disallowedTools Write,Edit,MultiEdit,NotebookEdit,Bash` | Claude can only read |

The CLI command is `claude` by default. Set `CLAUDE_COMMAND` to use another path.

### Skills and MCP

- The **skills** feature stores each skill as `.claude/skills/<name>/SKILL.md`, which Claude CLI loads automatically in that folder.
- The **mcp** feature stores each connection as a record and regenerates `.mcp.json` after every change. A stdio server needs `command` + `args`; a remote server needs `url` (`transport: http|sse`).
- **Open in Claude CLI** copies `cd <project> && claude`, and the same setup applies in the terminal.

### Workspace MCP server (`app/mcp.js`)

This is a stdio JSON-RPC server with no dependencies. Register it once:

```
claude mcp add workspace --scope user -- node "<path>/app/mcp.js"
```

Tools: `list_projects`, `get_project`, `create_project`, `update_project_yaml`, `list_features`, `save_feature`, `list_items`, `read_item`, `create_item`, `write_item`, `search`.

## 7. The app

### Server (`app/server.js`)

Plain Node `http` with no framework. It binds to `127.0.0.1:4321` (override with `PORT` / `HOST`).

| Route | Purpose |
|---|---|
| `GET /api/info` | version, paths, stores, layouts, field types |
| `GET /api/claude` | `claude --version` check |
| `GET /api/search?q=&project=` | full-text search |
| `GET/PUT/DELETE /api/features[/<key>]` | feature definitions |
| `GET/POST /api/projects`, `GET /api/projects/<p>` | projects |
| `GET /api/projects/<p>/overview` | overview tab data |
| `POST /api/examples` | add the example projects |
| `PUT /api/projects/<p>/yaml` | save project.yaml (validated) |
| `POST/DELETE /api/projects/<p>/features[/<key>]` | add/remove a feature |
| `GET/POST /api/projects/<p>/f/<feature>/items` | list / create items (`?folder=` for images/files) |
| `GET/PUT/DELETE …/items/<id>` | read / write / move to trash |
| `POST …/upload?folder=&filename=[&map=1]` | upload (raw body) |
| `POST …/trash` | move a file to trash |
| `POST …/chat` | run one chat turn (server-sent events) |
| `GET /api/events` | live refresh (server-sent events from a recursive `fs.watch`) |
| `GET /files/<p>/<path>` | raw project files (images, downloads) |

Safety:
- Every path goes through `safeJoin`, which refuses anything outside the project folder.
- Ids are checked against a strict pattern.
- Requests whose `Host` is not localhost are refused (protects against DNS rebinding).
- Write requests from other websites are refused through an `Origin` check (protects against CSRF).
- Deleting only ever moves items to `.trash/`.

### User interface (`app/public/`)

Vanilla JavaScript with no build step and no framework.
- `core.js`: helpers, icons, the Markdown renderer, modals and record forms.
- `views.js`: one render function per layout.
- `app.js`: sidebar, routing, home, project page, features, new project, search and live refresh.

Screens (from the accepted mockup, issue #2):

1. **Workspace home:** project cards with feature chips and counts.
2. **Project page:** an **Overview** tab first (a tile per feature with its count, *coming up* in the next 30 days from every date field, open Kanban tasks with overdue ones marked, recently changed items; hide it with `overview: false` in project.yaml), then a tab per feature from `project.yaml`, a note saying which `features/*.yaml` defines it, and a `project.yaml` tab with an editor.
3. **Features:** list, YAML editor with validation, a sketch of the layout, fields, and which projects use it.
4. **New project:** name, feature tick boxes, and a live `project.yaml` preview you can edit.
5. **Search** across all projects.

- **Theme:** light, dark or auto (follows the OS), switched in the sidebar and remembered in `localStorage`.
- **Sidebar:** can be collapsed to icons and project avatars (button at the bottom, or Ctrl+B), remembered in `localStorage`.
- **Live refresh:** when files change on disk (by hand or by Claude), the open view reloads, unless you are editing.

## 8. Decisions

| Topic | Decision |
|---|---|
| Storage | Plain files only, no database |
| Project definition | `project.yaml` lists which features a project has |
| Feature definition | YAML files in `features/` at the workspace root |
| New feature types | Added as YAML, no code; new building blocks need an app change |
| Building blocks | pages, cards, list, grid, files, table, kanban, calendar, orgchart, map, diagram, chat |
| Map | Offline image with pins |
| Diagram | Mermaid text |
| Chat | Claude CLI in the project folder; permissions per project |
| Theme | Light, dark, or follow the OS |
| App format | Node.js + browser. Portable `.exe` planned (#1) |
| Updates | Program and client data are separate (`data/`); update = replace everything except `data/` (#17) |
| Dependencies | None at runtime (Mermaid is bundled) |

## 9. Rebuilding it

You need Node.js 18 or newer. Nothing else is installed.

```
git clone https://github.com/GFGMNET/Workspace
cd Workspace
node app/server.js --open   # or start.bat / ./start.sh (--open opens the browser once ready)
npm test                # smoke test, incl. the MCP server
```

To port it to another stack, keep these contracts:
- **Folder layout** (section 2)
- **`project.yaml` rules** (section 3)
- **Feature settings** (section 4)
- **On-disk format per building block** (section 5)
- **Claude CLI flags** (section 6)

The UI can be rebuilt freely on top of the API in section 7.
