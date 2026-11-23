# Project Workspace: Design

This document describes what the workspace is, how it is built, and why. It has enough detail to rebuild it from scratch or port it to another stack.

Status: version 0.4. Requirements and their status: [REQUIREMENTS.md](REQUIREMENTS.md). Open work is tracked in [GitHub Issues](https://github.com/GFGMNET/Workspace/issues).

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
Workspace/                   ← the program: replaced on update (desktop app: see 7c for the runtime files)
  ProjectWorkspace.exe …     the desktop app's runtime (Electron), only in the Windows/Linux packages
  app/
    server.js                local web server + API
    mcp.js                   MCP server for Claude CLI
    electron/main.js         desktop app: window, menu, single instance (7c)
    electron/desktop.js      desktop app: tray, reminders, start with Windows (7c)
    lib/workspace.js         all file logic (features, projects, items, templates, due, first start)
    lib/yaml.js              YAML for the app: full YAML 1.2 (bundled "yaml" library in lib/vendor/yaml,
                             ISC), lenient fallback lib/yaml-lenient.js, comment-preserving record updates
    lib/chat.js              runs Claude CLI for the chat feature
    lib/files.js             explorer (file operations inside a project or the data folder)
    lib/ide.js               in-app VS Code: start/stop and the /ide proxy
    lib/secrets.js           encrypted secrets (7e)
    lib/updater.js           weekly update check and install (7b)
    lib/github.js            GitHub issues feature
    lib/exif.js              reads the "date taken" from photos
    public/                  the user interface (HTML/CSS/JS)
      vendor/                Mermaid (MIT), highlight.js (BSD-3), bundled for offline use
    starter/features/        starter feature definitions (copied into data/ on first start)
    starter/examples/        example projects (added on request)
    test/smoke.js            automated checks (npm test)
  docs/                      this document, requirements, getting started, wiki pages, release notes
  tools/                     vendor.json (bundled library versions), build helpers
  start.bat / start.sh       start with Node.js
  data/                      ← the client's data: never replaced, not in git
    .workspace.json          installed starter features, update state
    settings.yaml            workspace settings (in-app VS Code, updates, GitHub token)
    .secrets.json            encrypted secrets (7e)
    .ide-token               random access token for the in-app VS Code
    .desktop.json  .window.json  .app/   desktop app: tray/reminder settings, window size, Electron's cache
    features/                what each feature means — one YAML file per feature
    templates/               project templates (7f)
    projects/                one folder per project
      _archive/              archived projects
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
| `location: <folder>` | The project's content lives in an existing folder (e.g. a git clone). `project.yaml` stays in `data/projects/<slug>/`. Absolute paths, `~`, `{install}` (the program folder) and `{data}` work; relative paths are relative to the project's home folder. Feature folders, the Explorer, chat, scripts and the VS Code tab all use this folder, and it is watched for live refresh |
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
| `stores` | `markdown`, `images`, `files`, `records`, `diagram`, `chat`, `github` | `markdown` |
| `repo` | github: `owner/name` (any case of the key; a whole github.com address is accepted too, #84). The starter feature is `issue` (aliases `github_issue`, `github`, #83), github.com only | none |
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

Field types: `text`, `longtext`, `number`, `date`, `datetime`, `select` (with `options`), `bool`, `url`, `email`, `tags`, `list`, `keyvalue`, `link` (with optional `to: <feature>` and `multiple: true`; see section 5a). If no type is given, it is guessed from the name (`due` becomes a date, `email` an email, `notes` a longtext, and so on).

### Adding features

1. **In the app:** Features, then New feature (pick what it stores, the layout and the fields).
2. **By hand:** copy a YAML file in `features/` and change it.
3. **With Claude:** "add a feature Contacts with name, phone and company as a table" (through the MCP server's `save_feature` tool).

A feature can combine only the building blocks below. A truly new look (a new building block) is an app change.

## 5. Building blocks (storage × layout)

| Layout | Stores | On disk | What you see |
|---|---|---|---|
| `pages` | markdown | `<folder>/<id>.md` (+ `<folder>/assets/` for pasted pictures and files) | Page list with full-text search, Markdown view, editor with live preview, `[[Page]]` links (a link to a missing page creates it), Mermaid code blocks. Paste (Ctrl+V) or drop pictures/files into the editor: saved in `assets/` next to the page and linked at the cursor |
| `cards` | markdown | `<folder>/<id>.md` (tags in front matter) | Cards with summary and tags, search and tag filter |
| `list` | markdown / records | as above | Simple list |
| `grid` | images | `<folder>/<album>/*.png…` | Album cards (cover, count, date range), drag & drop upload, lightbox (arrow keys, Del moves to trash). Sort by date (newest/oldest), name or size; group by album, month or year; “All albums” shows every picture at once. Dates are the photo's EXIF *date taken* (JPEG), else the file date. Sort/group are remembered per gallery |
| `files` | files | `<folder>/<subfolder>/*` | Folder browser with upload |
| `code` | files | `<folder>/**` (any text files) | Explorer limited to the feature folder with a code editor (syntax colours, line numbers, Tab indents, Ctrl+S), *New script* templates (PowerShell, batch, Bash, Python, JS, SQL, …), *Open in VS Code*. Used by the starter feature **Scripts** |
| `table` | records | `<folder>/<id>.yaml` | Sortable, filterable table; click a row to edit |
| `cards` | records | `<folder>/<id>.yaml` | Cards showing the fields (the MCP feature also shows the generated `.mcp.json`) |
| `kanban` | records | `<folder>/<id>.yaml` | Columns from `columns:`; drag cards between them (this changes the status field) |
| `calendar` | records | `<folder>/<id>.yaml` | Month view (Monday first), multi-day events, upcoming list; click a day to add |
| `orgchart` | records | `<folder>/<id>.yaml` | Tree built from `reports_to` (by id or by name) |
| `map` | records | `<folder>/<id>.yaml` with `x`, `y` in % + `<folder>/_map.<ext>` | Your own image (floor plan, site plan) with draggable pins; works offline |
| `diagram` | diagram | `<folder>/<id>.mmd` (first line `%% Title`) | Mermaid text with live preview, SVG download |
| `chat` | chat | `<folder>/<date>-<title>.json` | Chat with Claude CLI inside the project folder (section 6) |
| `issues` | github | nothing on disk (GitHub API, cached 5 min) | Issues of `repo: owner/name`: open/closed/all, label filter, search, expand to read, *New issue* / *On GitHub*. Public repos need no login; a token in `data/settings.yaml` (`github: token:`) or `GITHUB_TOKEN` for private repos and higher limits |

Records are one YAML file per item, so they are readable, diff-friendly, and easy for Claude to edit.

### 5a. Links between features

The parts of a project can point at each other:

- **In Markdown:** `[[Router]]` links to the item with that title (or id) in *any* feature of the project, looking in the same feature first. `[[devices/router]]` names the feature and id exactly, and `[[Router|the router]]` changes the text shown. A link to a missing title offers to create a page.
- **In records:** a field of type `link` stores references. Without `to` the value is `feature/id`; with `to: devices` it is just the id. With `multiple: true` it holds a list. The form shows a type-ahead picker, and tables, cards and boards show clickable chips.
- **Mentioned in:** every page and record shows which pages and records link to it, from `[[…]]` links and link fields.

```yaml
# record: data/projects/home-lab/tasks/replace-the-old-switch.yaml
title: Replace the old switch
status: Doing
related: [devices/router, wiki/home]
```

## 6. Claude CLI integration

Claude always works inside the project's own folder, so it sees that project's files, skills and MCP connections and nothing else.

### Chat feature

For each message the server runs:

```
claude -p --output-format stream-json --verbose --include-partial-messages
       [--resume <session>] [--model <m>] [--mcp-config .mcp.json <permission helper>] [--permission-prompt-tool mcp__pw_permission__approve] <permission flags>
```

- The working directory is the project folder, and the message is sent on stdin, so no shell quoting is involved.
- The streamed JSON events (text deltas, tool use, tool results, the final result) are forwarded to the browser as server-sent events.
- The session ID is saved in the chat file, so each later message continues the same conversation (`--resume`).
- `--mcp-config .mcp.json` is passed explicitly because headless runs skip the "trust project MCP servers" prompt.

Permissions are set per project in `project.yaml` (`chat: { permissions: … }`):

| Mode | Claude CLI flags | Behaviour |
|---|---|---|
| `ask` | default permission mode (+ tools allowed so far in this chat) + `--permission-prompt-tool` | When Claude needs a tool that isn't allowed, Claude CLI calls the small MCP server `lib/permission-mcp.js` (a temporary `--mcp-config` file per turn, with a random token). It asks the app (`POST /api/chat-permission/<turn>`), the chat shows the question with what Claude wants to run or change, and **Allow** / **Always allow in this chat** (added to the chat's allowed tools and counted at once — later questions for that tool in the same answer are allowed without asking, e.g. every website for WebFetch) / **Don't allow** answers it (`POST …/<turn>/<question>/answer`); no answer in 10 minutes = not allowed. **A turn keeps running when the screen goes to another page** (no "unsaved changes" warning): `GET /api/projects/<p>/f/<chat>/chat/<id>` gives `{running, reply, permissions}` — the answer so far and open questions, which the chat shows when you come back — and `POST …/chat/<id>/stop` stops it (the **Stop** button). A second message to a chat that is still running is refused. If anything is still refused (`permission_denials`), **Allow and continue** resumes the session with `--allowedTools <tool>` as before (#10) |
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
claude mcp add project-workspace --scope user -- node "<path>/app/mcp.js"
# desktop app: -e ELECTRON_RUN_AS_NODE=1 -- "<folder>/ProjectWorkspace.exe" "<folder>/app/mcp.js"
```

Tools: `list_projects`, `get_project`, `create_project`, `update_project_yaml`, `list_features`, `save_feature`, `list_items`, `read_item`, `create_item`, `write_item`, `backlinks`, `search`.

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
| `GET /api/projects/<p>/index` | every linkable item (pages, records, diagrams) |
| `GET /api/projects/<p>/backlinks?feature=&id=` | "mentioned in" for one item |
| `POST /api/examples` | add the example projects |
| `PUT /api/projects/<p>/yaml` | save project.yaml (validated) |
| `PATCH /api/projects/<p>` `{name, folder}` | rename (only the `name:` line changes; `folder: true` also renames `projects/<slug>`) |
| `POST /api/projects/<p>/archive`, `GET /api/archive`, `POST /api/archive/<slug>/restore` | archive to `projects/_archive/` and restore |
| `DELETE /api/projects/<p>`, `DELETE /api/archive/<slug>` | delete the project's folder for good (a `location:` content folder is never touched) |
| `POST/DELETE /api/projects/<p>/features[/<key>]` | add/remove a feature |
| `GET/POST /api/projects/<p>/f/<feature>/items` | list / create items (`?folder=` for images/files) |
| `GET/PUT/DELETE …/items/<id>` | read / write / move to trash |
| `POST …/upload?folder=&filename=[&map=1]` | upload (raw body) |
| `POST …/trash` | move a file to trash |
| `POST …/chat` | run one chat turn (server-sent events) |
| `GET /api/fs/tree`, `GET/PUT /api/fs/file`, `POST /api/fs/mkdir`, `…/rename`, `…/trash`, `…/upload`, `GET /api/fs/raw` (all with `?scope=workspace` or `?scope=p/<project>` and `&path=`) | explorer |
| `POST /api/fs/vscode?scope=&path=` | open in VS Code (desktop) |
| `GET /api/ide`, `POST /api/ide/start`, `POST /api/ide/stop`, `GET /api/projects/<p>/ide` | in-app VS Code (status, start, stop, URL for a project) |
| `GET /api/due?days=` | what is due in all projects (home page, desktop reminders) |
| `GET /api/templates`, `POST /api/projects/<p>/template`, `DELETE /api/templates/<id>` | project templates; `POST /api/projects` takes `template` |
| `GET/DELETE /api/secrets`, `PUT/DELETE /api/secrets/<name>` | secrets (names only are ever sent back) |
| `GET /api/projects/<p>/f/<feature>/github?state=&refresh=` | GitHub issues feature |
| `GET /api/update`, `POST /api/update/check`, `…/skip`, `…/later`, `…/apply` | updates (7b) |
| `/ide/…` (HTTP and WebSockets) | reverse proxy to the in-app VS Code |
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

1. **Workspace home:** *Coming up in all projects* (overdue tasks first, next 14 days), project cards with feature chips and counts, archived projects, the Claude CLI command for the workspace MCP server.
2. **Project page:** an **Overview** tab first (a tile per feature with its count, *coming up* in the next 30 days from every date field, open Kanban tasks with overdue ones marked, recently changed items; hide it with `overview: false` in project.yaml), then a tab per feature from `project.yaml`, a note saying which `features/*.yaml` defines it, and the `project.yaml` editor, opened from the gear (Manage) menu (#87; it shows as a tab only while open). A **Tabs** button hides tabs per project: `hide_tabs: [keys]` in project.yaml, a project setting like `overview:` (#89). Two layouts (#90), switched in the menu and kept in the browser's storage (`pw-layout`, like the theme): *menu left* (sidebar, feature tabs on top) and *menu top* (`html.layout-top`: the sidebar becomes a top bar with a project drop-down, the feature tabs become a list on the left that collapses to icons, `pw-ftabs`). Below 900 px both use the phone menu. Checked in Chromium and WebKit by `tests/ui/layout.test.js`.
3. **Features:** list, YAML editor with validation, a sketch of the layout, fields, and which projects use it.
4. **New project:** name, *Start from* a template or blank, feature tick boxes, and a live `project.yaml` preview you can edit.
5. **Search** across all projects.
5b. **Secrets** (sidebar): names of the stored secrets, add/replace/delete, which protection is in use (7e).
5c. **Project tabs**: features, Explorer, VS Code and project.yaml; tabs that don't fit go into a **More** menu (the open tab stays visible), **+** adds a feature.
5d. **Manage** (gear icon in the project header): the project folder (copy path, copy the Claude CLI command, open in VS Code), rename (optionally the folder too), remove features from the project (files stay), save as template (7f), archive (moves the folder to `projects/_archive/`, hidden from the list; *Archived projects* on the home page restores or deletes them), delete (type the name to confirm; deletes `projects/<slug>` only).
6. **Explorer:** every project has an *Explorer* tab with the whole project folder as a tree (incl. `project.yaml`, `.claude/`, `.mcp.json`), and the sidebar has a workspace explorer (features + all projects). Text files open in the code editor (Markdown with preview, images shown); new file/folder, upload, rename/move, delete (to `.trash`), download. Saving a `project.yaml` or feature YAML is validated first.
7a. **Ticket (GLPI, 1.0):** feature `stores: glpi`, layout `tickets` (`app/starter/features/ticketsystem.yaml`). `pw-server::glpi` talks to GLPI 11's REST API (`apirest.php`): per request it opens a session with the user token (+ app token), finds the ITIL category with the project's name or creates it, and works only on tickets of that category (others answer 404); then it closes the session. Settings `url`, `user`, `user_token`, `app_token` come from the feature in `project.yaml`, the tokens as `${secret:…}`. Addresses: `GET/POST /api/projects/{p}/f/{f}/tickets`, `GET/PATCH …/tickets/{id}`, `POST …/tickets/{id}/followups|solution`. Rich text from GLPI is shown as plain text. Tests: `tests/contract/tickets.test.js` (fake GLPI), plan check `docs/plans/checks/glpi-check.js` (real test server). Plan: [plans/TICKETSYSTEM.md](plans/TICKETSYSTEM.md).
7. **VS Code tab (full VS Code in the app):** (values in `settings.yaml` are quoted: a value starting with `{` would be read as a YAML mapping; files from older versions are repaired on read) shows the browser version of VS Code, opened on the project folder, in an embedded frame. From 1.0.1 the tab starts it by itself when it is opened (no button; "VS Code is starting…" meanwhile), shows only the editor, and says "VS Code is not installed" with the download link when the `code` command is missing ([plans/VSCODE.md](plans/VSCODE.md)). By default the app starts the installed VS Code's own web server (`code serve-web --server-base-path /ide`, downloads its web part once) on `127.0.0.1:8740` with a random connection token (kept in `data/.ide-token`), and stops it when the app exits. The browser never talks to that port directly: the app **reverse-proxies `/ide/…` (HTTP and WebSockets)** on its own address and removes frame-blocking headers, so the embedded VS Code is same-site and browsers don't block it (#30). Settings from v0.3.0 (direct `http://{host}:{port}` URLs) are upgraded automatically; code-server, which serves at its root, uses `strip_base: true`. The command, port and URL are set in `data/settings.yaml` (`ide:`), so code-server or OpenVSCode Server can be used instead. (Until 1.0.1 a row of buttons — Reload, Open in new window, Desktop VS Code, Stop — was shown above the editor; it was removed by decision.)
8. **VS Code buttons:** *Open in VS Code* in Manage and on every file run the `code` command (`VSCODE_COMMAND` to override) to open the project folder in the installed VS Code and jump to the file. If `code` is not on the PATH the browser is asked to open a `vscode://file/…` link.

- **Theme:** light, dark or auto (follows the OS), one toggle button in the sidebar (Light → Dark → Auto), remembered in `localStorage`. Next to it one toggle button for the layout (menu left / menu top). In the menu-left layout, more than 4 projects are shown in the project drop-down instead of the list (`many-projects` class; not when collapsed to icons or on small screens).
- **Sidebar:** can be collapsed to icons and project avatars (button at the bottom, or Ctrl+B), remembered in `localStorage`.
- **Live refresh:** when files change on disk (by hand or by Claude), the open view reloads, unless you are editing.

## 7b. Updates

Live installations never use git; they are updated from **GitHub Releases** (#26).

- **Weekly check:** the server asks `https://api.github.com/repos/GFGMNET/Workspace/releases/latest` (public, no login, nothing sent about the client) at most once a week, and the UI shows the result. The last check, the latest release, *skip* and *later* are stored in `data/.workspace.json`. Turn checking off with `updates: check: false` in `data/settings.yaml`; `updates: repo:` points to another repository.
- **Banner:** *Version X is available* · **What's new** (the release notes) · **Update now** · **Later** (a week) · **Skip this version**. The sidebar shows the version and a dot when an update is waiting; *v… · Updates* opens the same dialog with *Check now*.
- **Update now:**
  1. downloads the release zip that fits the installation (`pickAsset`: Windows/Linux package for the desktop app, the plain zip for Node.js)
  2. unpacks it with the app's own unzip (paths are checked, Unix file modes kept) and checks that it really is Project Workspace
  3. moves the current program into `.update/backup-<version>-<time>/`, then copies the new program in (desktop app: the runtime only when its Electron version changes, 7c). `data/` is never touched
  4. restarts

  If anything fails, the old program is put back.
- **Restart:** the desktop app restarts itself (`app.relaunch`, or the runtime swap script). `start.bat` / `start.sh` run the server in a loop and start it again on exit code 75. A server started without them starts a new process itself, which waits for the port. The page reloads once the new version answers.
- **Start scripts:** they are running while the update happens, so they are only replaced when unchanged; otherwise the new one is saved as `start.bat.new` / `start.sh.new`.
- **Releases** are made by `.github/workflows/release.yml`: *Actions → Release → Run workflow* releases the version in `package.json`. It runs the tests, zips the program (`git archive`, so no client data), builds the Windows and Linux apps and publishes the release; the notes come from `docs/releases/vX.Y.Z.md` (else generated).

## 7c. Desktop app (Windows and Linux)

The release packages are a desktop app built with **Electron**: the workspace opens in its own window
(not a browser tab), with Node.js and the browser engine included. Nothing to install.

```
ProjectWorkspace/                      (Linux: project-workspace/)
  ProjectWorkspace.exe                 Electron runtime, renamed   (Linux: project-workspace-bin + start script project-workspace)
  *.dll *.pak locales/ resources/ …    the rest of the runtime
  resources/app/                       bootstrap: loads app/electron/main.js from the folder next to the exe
  runtime.json                         Electron version, platform, arch, the runtime's file names
  project-workspace-server             Linux only: the server without a window (for servers)
  app/ docs/ tools/ README.md LICENSE package.json      the program
  data/                                created on first start (Electron's own cache goes to data/.app)
```

- **app/electron/main.js** runs `app/server.js` inside the app and shows `http://localhost:<port>` in a window.
  It keeps one instance (a second start focuses the window), remembers the window size (`data/.window.json`)
  and uses a workspace that is already running on the port (e.g. from `start.bat`).
  Pages of the workspace stay in the app ("Open in new window" opens an app window); other links
  (wiki, GitHub, websites) open in the normal browser. Menu: *Open in browser*, *Open data folder*, zoom, DevTools.
- **Options:** a port number, `--browser` (open a normal browser tab instead), `--version`, `--mcp`.
- **MCP for Claude CLI:** the runtime can run as plain Node:
  `claude mcp add project-workspace --scope user -e ELECTRON_RUN_AS_NODE=1 -- "<folder>\ProjectWorkspace.exe" "<folder>\app\mcp.js"`
  (the app shows the exact command on the home page).
- **Linux:** portable zips can't carry the setuid sandbox helper, and Chromium stops before any app code runs without it.
  So `project-workspace` is a start script that runs `project-workspace-bin --no-sandbox` unless `chrome-sandbox`
  is set up (owned by root, mode 4755); restarts go through the script too. The window only shows the local workspace.
  `project-workspace-server` runs the server without a window (`ELECTRON_RUN_AS_NODE`), for machines without a desktop.
- **Builds:** `.github/workflows/build-windows.yml` (x64) and `build-linux.yml` (x64 on `ubuntu-latest`, arm64 on
  `ubuntu-24.04-arm`) download Electron (major version in `tools/electron/electron-version`, latest patch),
  rename it, set icon and file details (`rcedit`, Windows), add the bootstrap and the program, and check on the runner
  that the window renders the workspace (`PW_SMOKE_FILE`), that the MCP server answers and (Linux) the server mode.
  Zips: `project-workspace-vX.Y.Z-windows-x64.zip`, `-linux-x64.zip`, `-linux-arm64.zip` (Unix file modes kept).
- **Updates:** the updater picks the package for its platform and processor (`pickAsset`). Program files are replaced
  right away. The runtime's files (from `runtime.json`) stay as they are when the Electron version is the same;
  otherwise the new runtime is put in place by a small script after the app has quit (`runSwap`), which then starts it again.
  The app restarts itself after an update (`app.relaunch`); the new instance waits for the port.
- Keeping Electron current: a release picks up the newest patch of the Electron major in `electron-version`;
  raise the major before it reaches its end of life (every Electron major is supported for about 6 months).
- Until v0.5 the packages used Node's single executable application feature instead (one exe, opened the browser).
- **Tray, reminders, autostart** (`app/electron/desktop.js`, settings in `data/.desktop.json`): a tray icon
  (closing the window hides it while the tray is on); every 30 minutes `GET /api/due?days=1`, a notification per item due
  today or overdue (once per item and date, `notified` in `.desktop.json`; more than 3 → one summary), click opens the item;
  *Start with Windows* via `app.setLoginItemSettings` (`--hidden`), on Linux `~/.config/autostart/project-workspace.desktop`.

## 7e. Secrets

`app/lib/secrets.js`. `data/.secrets.json` holds `{ key, items: { name: { iv, tag, data, updated } } }`; each value is
AES-256-GCM encrypted with a random 32-byte key. The key is encrypted with Electron `safeStorage` (DPAPI on Windows,
Keychain on macOS, the keyring on Linux; `basic_text` counts as unprotected) when the server runs inside the desktop app
(`global.pwSafeStorage`), otherwise stored as is (`protected: none`, shown in the dialog). A plain key is upgraded as soon as
the app can protect it. A key that can't be decrypted (other computer/user) makes the secrets *locked*: they can be removed and entered again.

- In YAML: `${secret:name}`. `writeMcpJson` turns it into `${PW_SECRET_NAME}` (Claude CLI expands environment
  variables in `.mcp.json`); `chat.js` passes exactly the secrets referenced there as environment variables.
  `settings.yaml` values the app uses itself (`github: token:`) are resolved directly (`secrets.resolve`).
- API: `GET /api/secrets` (names only), `PUT /api/secrets/<name> {value}`, `DELETE /api/secrets/<name>`, `DELETE /api/secrets`.
- `.secrets.json`, `.ide-token` and `.app/` are private: the explorer (`files.js`) neither lists nor opens them.

## 7f. Templates and what's due

- **Templates:** `data/templates/<id>/` = `project.yaml` (without `location:`) + `template.json` (name, description, content, from, created)
  + optionally the feature folders (not chat, not github, no `.trash`/`.git`/`node_modules`, max. 200 MB).
  `POST /api/projects/<slug>/template`, `GET /api/templates`, `DELETE /api/templates/<id>`;
  `POST /api/projects { name, yaml, template }` copies the template's files, then writes the given project.yaml.
- **Due in all projects:** `ws.dueAll(days)` collects `projectOverview().upcoming` of every project (overdue Kanban
  items + dated records in the next days), `GET /api/due?days=14`. Shown on the home page; used by the desktop reminders.

## 7g. Security

**Attack surface.** The server listens on `127.0.0.1` only; requests must come from `localhost`/`127.0.0.1` (Host check, against DNS
rebinding) and changing requests and WebSockets from a local origin (Origin check, against CSRF); file access is limited to the
workspace and project folders (`safeJoin`, `rel2abs`); app-private files are never served (see 7e). The desktop window loads
only the local workspace (sandbox, context isolation, no Node in the page); other links open in the system browser.

**What we ship, and how it stays current**

| Component | Source of CVEs | How it is kept current |
|---|---|---|
| Electron (Chromium + Node.js) | by far the most | `.github/workflows/security.yml`, weekly: newest patch of the major in `tools/electron/electron-version`; newer than the latest release (`electron-version.txt` asset, or `runtime.json` in the Windows zip) → patch release (+0.0.1) is committed and released automatically (together with whatever is already on main; notes collected in `docs/releases/vX.Y.Z.md` are kept); the apps install it with their weekly update. When the major is the oldest supported one → issue to move to the next. |
| Bundled libraries (yaml, Mermaid, highlight.js) | few | `tools/vendor.json` lists the versions; the same workflow checks npm for newer versions and known advisories → issue (security: right away, plain updates: monthly). |
| Our own code | logic mistakes | CodeQL (`.github/workflows/codeql.yml`: JavaScript + workflows, on every push and weekly); tests in `app/test/smoke.js`. |
| Build workflows | supply chain | Dependabot (`.github/dependabot.yml`) for GitHub Actions. |
| Node.js / browser (start.bat, start.sh) | the user's | not shipped; the user keeps them current. |

**Reporting:** `SECURITY.md` — private reports through GitHub (*Security → Report a vulnerability*). Only the latest release gets fixes.

**Not done yet:** signed updates and a code-signed exe (#49, #31). A first attempt (a signing key on the maintainer's PC, scripts to sign each release) was removed again on 2026-11-16 as too cumbersome; the new plan is [plans/RELEASE-TRUST.md](plans/RELEASE-TRUST.md).

## 7a. Documentation

| Document | For whom | Where |
|---|---|---|
| `README.md` | first look, start, update | repo root |
| `docs/GETTING-STARTED.md` | new users: install, first project, first feature, Claude, VS Code, updating | repo + wiki *Getting-Started* |
| `docs/wiki/*.md` | user guide: projects, features (all settings), **a page per starter feature** (`Feature-<Name>.md`: all its options, examples, what it stores), building blocks, Claude, VS Code & Explorer, data & updates, FAQ | GitHub wiki |
| Help links in the app | *Help & wiki* in the sidebar; *Help* on every feature tab and in the feature editor opens that feature's wiki page; *Getting started* on the home page | `package.json` → `wiki` |
| `docs/DESIGN.md` | developers: architecture and rebuild guide | repo + wiki *Design* |
| `docs/REQUIREMENTS.md` | everyone: every requirement with status and issue | repo + wiki *Requirements* |

The GitHub wiki is **generated**: `tools/build-wiki.js` copies `docs/wiki/` and turns the three documents above into wiki pages (links and screenshots rewritten). The workflow `.github/workflows/wiki.yml` runs it on every push to `main` that touches `docs/` and pushes the result to the wiki. Edit the files in `docs/`, never in the wiki itself. One-time setup: the first wiki page must be created on GitHub once, because GitHub only creates the wiki repository then.

## 7d. YAML

All YAML (project.yaml, features, records, settings.yaml) is read with the bundled **yaml** library (eemeli/yaml 2.x, ISC licence, no dependencies, vendored by `tools/vendor-yaml.js`). It is full YAML 1.2 plus merge keys:
- anchors and aliases
- `<<:` merges
- block (`|`, `>`) and flow styles
- tags
- several documents in one file, whose mappings are merged in order

Values follow YAML 1.2, so `2026-11-18`, `00:11:22:33:44:55` and `yes` stay text. Errors are reported as `Line X, column Y: …`.

- **Lenient fallback:** a file that isn't valid YAML is tried once more with the app's original forgiving reader (`yaml-lenient.js`), so hand-written files like the original example (` wiki:` indented by one space) still open. The project page and the Features page then show a warning asking to fix the file.
- **Comments stay:** saving a record from a form only rewrites the changed values (`updateMapping`), keeping its comments, key order and style. Adding a feature appends text to project.yaml, and renaming changes only the `name:` line.

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
| App format | Desktop app (Electron, own window) for Windows and Linux (x64, arm64), built by GitHub Actions; Node.js + browser also works (#1, #32, #36) |
| Licence | MIT (#13) |
| Updates | Program and client data are separate (`data/`) (#17); weekly check of GitHub Releases with one-click update, backup and restart (#26) |
| Dependencies | None to install: Mermaid, highlight.js and yaml are bundled |
| Security | Weekly automatic Electron security releases, CodeQL, Dependabot (7g); v1.0 planned in Rust + Tauri to stop bundling a browser engine (10, #41) |
| YAML | Full YAML 1.2 (bundled library) with a lenient fallback and a warning for non-standard files (#12) |
| Documentation | Getting started guide + GitHub wiki generated from `docs/` (#25) |
| Developing the tool | It can manage itself: the example project *Workspace (development)* uses `location: "{install}"` with docs, scripts, GitHub issues, chat and a *release* skill (#27–#29) |

## 8b. Tests

| What | Where | Runs |
|---|---|---|
| Unit checks (logic, YAML, updater, secrets, templates …) | `app/test/smoke.js` (`npm test`) | every push, every build |
| API contract tests: every route, answers, errors, files on disk, security checks, chat stream with a fake Claude CLI, fakes for GitHub, updates and VS Code, the MCP server | `tests/contract/` (`npm run test:contract`) | every push, Linux + Windows |
| YAML corpus: how each file is read (golden answers), comments kept on update | `tests/yaml-corpus/` (`npm run test:yaml`; regenerate with `tools/yaml-golden.js`) | every push |
| Desktop app: window renders, MCP, server mode | build workflows (`PW_SMOKE_FILE`) | every build |
| VS Code tab with the real `code serve-web` | *VS Code tab check* workflow | by hand |

The contract tests and the corpus test any implementation: `PW_SERVER_CMD="… {port}"`, `PW_MCP_CMD`, `PW_YAML_CMD` (for the Rust version).

## 9. Rebuilding it

You need Node.js 18 or newer. Nothing else is installed.

```
git clone https://github.com/GFGMNET/Workspace
cd Workspace
node app/server.js --open   # or start.bat / ./start.sh (--open opens the browser once ready)
npm test                # automated checks, incl. the MCP server
```

The desktop app is built by GitHub (*Build Windows app*, *Build Linux app*, 7c); to try it locally, install Electron
(`npm i electron@45`) and run `npx electron tools/electron/bootstrap` from a folder laid out as in 7c.

To port it to another stack, keep these contracts:
- **Folder layout** (section 2)
- **`project.yaml` rules** (section 3)
- **Feature settings** (section 4)
- **On-disk format per building block** (section 5)
- **Claude CLI flags** (section 6)

The UI can be rebuilt freely on top of the API in section 7.

## 9b. Planned features

| Feature | Plan | Issue |
|---|---|---|
| Ticketsystem (GLPI 11; osTicket dropped) — v1.1, Rust | [plans/TICKETSYSTEM.md](plans/TICKETSYSTEM.md) | #59 |
| Versions (Git, then SVN; local, shared folder or own server) — **v1.0.1**, Rust (plan rewritten 2026-11-19; open questions for the maintainer) | [plans/VERSION-CONTROL.md](plans/VERSION-CONTROL.md) | #60 |
| Trusted releases (signed exe, update check) | [plans/RELEASE-TRUST.md](plans/RELEASE-TRUST.md) | #49, #31 |
| macOS app | ❌ not planned (2026-11-18) | #56 |
| VS Code tab: focused layout (editor + explorer) | | #62 |

## 10. Version 1.0: Rust + Tauri (beta, #41)

The detailed plan (inventory, crates, phases with exit criteria, tests, risks, decisions) is in [MIGRATION-RUST.md](MIGRATION-RUST.md); milestone *v1.0 (Rust)*, issues #49–#55.

**Status:** phases 0–3 ✅ — the Rust server passes the whole API contract suite (34/34, incl. chat, VS Code proxy, updates,
GitHub issues, MCP server) and the YAML corpus (33/33) on Linux and Windows. Phase 4: betas **0.9.0.x** (pre-releases, unsigned,
built by `.github/workflows/build-rust.yml`, Windows x64 + Linux x64) are being tested by the maintainer. 1.0 is built for **Windows 11 x64 and Linux x64** only:
no Windows 10 (#73), no arm64 (#64), no macOS (#56) — decided 2026-11-18.
Then signing with the own certificate (0.9.1, [plans/SIGNING.md](plans/SIGNING.md)) and 1.0.0. The code is in `rust/`; the plan and status: [MIGRATION-RUST.md](MIGRATION-RUST.md).

**Name:** from 1.0 the app is called **Workspace** everywhere (window, tray, notifications, `Workspace.exe`, `workspace` on Linux,
downloads `workspace-vX.Y.Z-…zip`); decided 2026-11-18 (#77). The MCP server keeps the name `project-workspace` (`workspace` is reserved
in Claude CLI).

**Differences to 0.x:** the window's X quits the app (no hiding in the tray); a running 0.x app on the same port is left alone
(1.0 takes the next free port); a reminder can't be clicked (the due items are listed in the tray menu instead — one click opens the item, #75); on Linux the secrets are entered again.

**Why.** Security, not speed: most CVEs we have to ship come from Chromium and Node.js inside Electron (7g).
With Tauri the app uses the browser engine of the system — **WebView2** on Windows (updated by Windows/Edge, not by us),
**WebKitGTK** on Linux (updated by the distribution) — and the core becomes a Rust program (memory-safe, no runtime).
Side effects: downloads of about 10–20 MB instead of 120–157 MB, less memory.

**What stays the same**
- The data folder, `project.yaml`, `features/*.yaml`, all files on disk: a 1.0 installation reads a 0.x data folder unchanged.
- The screens: `app/public` (HTML, CSS, JavaScript) is kept as it is.
- The HTTP API (`/api/...`, SSE `/api/events`, `/ide` proxy). Keeping it means the browser still works (`--browser`),
  the VS Code tab keeps its same-origin proxy, and the screens need no change.
- Claude CLI integration (chat via `claude -p`, skills, `.mcp.json`, the workspace MCP server), secrets syntax `${secret:name}`.

**Architecture**

```
crates/
  pw-core     yaml (+ lenient reader, comment-keeping updates), workspace (features, projects), items (all storage
              types, uploads, photo dates), files (explorer), links (search, backlinks, overview, due), projects
              (create, rename, archive, templates), secrets (AES-256-GCM; key via Windows DPAPI or the Linux keyring)
  pw-server   axum + tokio: the same routes as app/server.js; live refresh (notify); chat (Claude CLI, permission
              helper `permission-mcp`); VS Code proxy incl. WebSockets (hyper); updater; GitHub issues;
              the workspace MCP server (`mcp`). Binary: workspace-server (no window, no WebKitGTK needed)
  pw-app      Tauri 2: window on http://localhost:<port>, tray, reminders, autostart, single instance, window size;
              no Tauri IPC commands for the page (capabilities: none). Binary: Workspace.exe / workspace
app/public    unchanged screens, served by pw-server
```

**Choices made in the prototype**
- YAML: `yaml-rust2`, plus our own forgiving reader for sloppy files and a text-level, comment-keeping update of records.
  Merge keys, anchors and several documents behave as in 0.x (YAML corpus 33/33).
- The page is loaded from `http://localhost` inside WebView2/WebKitGTK; the VS Code tab (iframe, WebSockets), Mermaid, drag & drop
  and paste work.
- Linux: WebKitGTK 4.1 must be installed (most desktops have it); `workspace-server` has no such need.
- Windows 10 is not supported (decided 2026-11-18, #73); Windows 11 always has WebView2.

**Security work that comes with it**
- rustls instead of OpenSSL, minimal crate features ✅. `cargo-deny` checks vulnerabilities, licences and sources on every change
  and every Monday (`.github/workflows/rust-security.yml`, `rust/deny.toml`; a weekly finding opens an issue) ✅; `rust/Cargo.lock` is
  committed and builds use `--locked` ✅ (#72). Weekly check like 7g, for crates.
- **Trusted releases:** Windows programs are signed with the project's own certificate ([plans/SIGNING.md](plans/SIGNING.md)):
  `signing/` holds the certificate with its key (no password), the public part and the fingerprint; `build-rust.yml` signs with it; the updater (`updater.rs` `check_signature`, 0.x `updater.js`) accepts only that fingerprint and an
  unchanged file. Windows reports "not trusted" until the certificate is installed (wiki: Signing certificate).
- The security check of 7g then watches crates and the bundled JS libraries; there is no browser engine of our own to patch.

**Moving from 0.x** (#74, built, in the next 0.x release 0.6.3). The 0.x desktop app's updater recognises the 1.0 package
(`Workspace.exe`/`workspace`, `workspace-server`, `app/public`, no `package.json`), checks it like 1.0 does (Windows: signature with the
project's own certificate (fingerprint built in), unchanged file, product name *Workspace*; Linux: SHA-256 from `SHA256SUMS`), switches off its own "start with the computer"
entry (1.0 makes its own from the same `data/.desktop.json`), and after it has quit a small script moves the old program files
into `.update/backup-<version>-…`, moves 1.0 in and starts it. `data/`, `.update/` and `.git/` stay where they are. The Node.js
package (start.bat/start.sh) isn't offered 1.0: download it by hand.

**Phases**
0. ✅ **API contract tests:** move the HTTP-level checks into a test suite that runs against a server URL, and run it against today's
   Node server. The Rust server must pass the same suite.
1. ✅ **Prototype** (Windows + Linux): Tauri window, project list, wiki feature, YAML reading incl. the sloppy example, VS Code tab.
   → Decision: go / no go.
2. ✅ **Core:** everything in `pw-core` with the contract tests green.
3. ✅ **The rest:** chat, VS Code proxy, MCP server, updater with signatures, secrets, desktop extras (tray, reminders, autostart).
4. 🚧 **Beta** next to 0.x (separate download, same data folder after a backup; 0.x keeps getting security releases).
5. **1.0**: the 0.x apps are offered the update.

Effort: several weeks; most of it in phases 2–3. The screens are reused, which saves about half of the work.

