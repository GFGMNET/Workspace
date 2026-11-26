# Project Workspace: Design

This document describes what the workspace is, how it is built, and why. It has enough detail to rebuild it from scratch or port it to another stack.

Status: version **1.0.1** (released 26 Nov 2026). Requirements and their status: [REQUIREMENTS.md](REQUIREMENTS.md). Open work is tracked in [GitHub Issues](https://github.com/GFGMNET/Workspace/issues).

---

> **The app is the Rust + Tauri version** (1.0.0 and 1.0.1, released 26 Nov 2026; §10). The old 0.x app (Node.js + Electron,
> last release 0.6.3) is **deprecated**. Its Node server (`app/server.js`, `app/lib/`) is still in the repository only as the
> reference that the contract tests were written against; features from 1.0.1 exist only in Rust.

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
Workspace/                   ← the program (the release zip): replaced on update
  Workspace.exe              Windows: desktop app (Tauri window + tray + server in one program)   Linux: workspace
  workspace-server(.exe)     the server without a window (for servers), also the MCP server (`workspace-server mcp`)
  app/
    public/                  the screens (HTML/CSS/JS, no build step) — served by the server
      vendor/                Mermaid (MIT), highlight.js (BSD-3), bundled for offline use
    starter/features/        built-in feature definitions (copied into data/features, updated by `version:`)
    starter/examples/        example projects (added on request)
    help/pages, help/screenshots   the wiki inside the app (made by the release build from docs/wiki)
  LICENSE
  data/                      ← the client's data: never replaced, not in git
    .workspace.json          installed built-in features and their versions, update state, notices
    settings.yaml            workspace settings (in-app VS Code, updates, GitHub token)
    .secrets.json            encrypted secrets (7e)
    .ide-token               random access token for the in-app VS Code
    .desktop.json  .window.json   desktop app: tray/reminder settings, window size
    features/                what each feature means — one YAML file per feature
    templates/               project templates (7f)
    projects/                one folder per project
      _archive/              archived projects
      <project>/
        project.yaml         which features this project has
        <feature folder>/... the content
        .claude/skills/...   written by the skills feature (read by Claude CLI)
        .mcp.json            written by the mcp feature (read by Claude CLI)
        .version-control/    Git copy of the Version Control tab (file list + history)
        blender/ unity/ …    what Claude makes with an MCP program (programs:)
        .trash/              deleted items end up here (never really deleted)
```

The repository (for developing only):

```
rust/                        the app: crates pw-core, pw-server, pw-app (§10)
app/public, app/starter      the screens and the built-in features (shipped)
app/server.js, app/lib/      the old 0.x Node server — reference for the contract tests only
tests/contract/, tests/yaml-corpus/   the safety net (run against the Rust binaries on GitHub)
docs/                        this document, requirements, wiki (docs/wiki), plans (docs/plans), release notes
tools/                       build-wiki.js, vendor.json, yaml helpers, vote/issue list scripts
signing/                     the project's own signing certificate (no password; plans/SIGNING.md)
```

**Program and data are separate.** The GitHub repository is only for developing the tool. A live installation never touches git: a new version is downloaded and replaces everything except `data/`.

- **First start:** `data/` is created and the starter features are copied in. Example projects are only added when you click *Add the example projects* on the empty home page.
- **Update:** built-in features that are new in that version are added once (tracked in `.workspace.json`). A built-in feature whose `version:` went up is updated; the old file is kept as `<key>_deprecated.yaml` "(deprecated)" for projects that still use it, and their tab shows **Use the new version** (§4b). A built-in feature the client deleted can be brought back with *Features → Restore built-in features*.
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
| `hide_tabs: [keys]` | Tabs hidden in this project (feature keys, `overview`, `explorer`, `vscode`) |
| `programs: [blender, …]` | MCP programs switched on for the chat (§6) |
| `dashboard:` | The Overview's dashboard blocks (§7, screen 2) |
| `overview: false` | Hides the built-in Overview tab |
| `location: <folder>` | The project's content lives in an existing folder (e.g. a git clone). `project.yaml` stays in `data/projects/<slug>/`. Absolute paths, `~`, `{install}` (the program folder) and `{data}` work; relative paths are relative to the project's home folder. Feature folders, the Explorer, chat, scripts and the VS Code tab all use this folder, and it is watched for live refresh |
| a list | Starting items. Each one is created as a file when the project is saved; existing files are never overwritten |
| a mapping | Settings that override the feature definition for this project only. `items:` holds starting items, `feature:` points to another feature definition |
| empty | Just adds the feature |

- **The folder is the source of truth.** Items that exist on disk appear even if they are not listed in `project.yaml`, so you can drop a `.md` file or a picture into the folder and it shows up.
- **The app keeps comments in `project.yaml`:** adding a feature appends; `programs:`, `dashboard:` and settings are changed with the comment-keeping update (`yaml::update_mapping`); removing a feature deletes that key's block.
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
| `icon` | book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue, github | by layout |
| `stores` | `markdown`, `images`, `files`, `records`, `diagram`, `chat`, `github`, `glpi`, `comfyui`, `vcs` | `markdown` |
| `version` | built-in features only: raised when the app ships a changed definition (§4b) | none |
| `repo` | github: `owner/name` (any case of the key; a whole github.com address is accepted too, #84). The starter feature is `issue` (aliases `github_issue`, `github`, #83) | none |
| `engine` | issues: `github` (default) or `forgejo` (+ `url`, `token`); chat: `claude` (default) or `lmstudio` (+ `url`, `model`) | see left |
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
| `model` | chat: Claude model alias, or the LM Studio model | CLI default |
| `url` | comfyui: ComfyUI's address · issues (forgejo) · chat (lmstudio, default `http://127.0.0.1:1234`) · glpi | none |
| `type`, `protocol`, `server`, `port`, `path`, `user`, `password`, `key` | vcs (§5b) | none |

Field types: `text`, `longtext`, `number`, `date`, `datetime`, `select` (with `options`), `bool`, `url`, `email`, `tags`, `list`, `keyvalue`, `link` (with optional `to: <feature>` and `multiple: true`; see section 5a). If no type is given, it is guessed from the name (`due` becomes a date, `email` an email, `notes` a longtext, and so on).

### Adding features

1. **In the app:** Features, then New feature (pick what it stores, the layout and the fields).
2. **By hand:** copy a YAML file in `features/` and change it.
3. **With Claude:** "add a feature Contacts with name, phone and company as a table" (through the MCP server's `save_feature` tool).

A feature can combine only the building blocks below. A truly new look (a new building block) is an app change.

### 4b. Built-in features (`pw-core::builtin`, plan BUILTIN)

The starter features in `app/starter/features/` are the built-in ones. On every start (`ensure()`), `update_builtins()` compares
their `version:` with the installed one: a higher version replaces `data/features/<key>.yaml`; projects that used the old one
get `feature: <key>_deprecated` (the old file is kept, its name marked "(deprecated)") and a notice. The screen shows the notices once
as toasts (`featureNotes` in `/api/info`, cleared with `DELETE /api/feature-notes`) and **Use the new version** on such a tab
(`POST /api/projects/{p}/features/{k}/use-new`, the project's own settings stay). `GET /api/builtin-features` lists the missing
ones, `POST /api/builtin-features` restores the ticked ones.

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
| `issues` | github | nothing on disk (GitHub API, cached 5 min) | Issues of `repo: owner/name`: open/closed/all, label filter, search, expand to read, *New issue* / *On GitHub*. Public repos need no login; a token in `data/settings.yaml` (`github: token:`) or `GITHUB_TOKEN` for private repos and higher limits. `engine: forgejo` + `url:` (+ `token:` as a secret) reads a Forgejo server's API (`/api/v1/repos/{repo}/issues?type=issues`; self-made certificates accepted; pull requests left out) |
| `tickets` | glpi | nothing on disk (GLPI REST API) | Tickets of the project's GLPI category (screen 7a) |
| `journal` | markdown | `<folder>/<id>.md` with `date:` | Entries grouped by year and month, newest first; **New** = today's date and time |
| `book` | markdown | as pages, order and chapters in the front matter | Contents (can be hidden), one page, A−/A+, previous/next, full screen; drag pages to reorder |
| `notes` | markdown | as pages, `color:` in the front matter | Sticky notes in a grid with six colours |
| `board` | markdown | as pages, `status:` in the front matter | Kanban for pages; `columns:` (default *Idea / In progress / Done*) |
| `table` | markdown | as pages | Table of title, tags, last change and every front-matter field; edit a cell in place (only that value changes) |
| `blog` | markdown | as pages, `date:` | Contents with headings on the left, pages one after another, newest first |
| `comfyui` | comfyui | `<folder>/workflows/*.json` + `labels.json`; results in the Gallery album `KI_Pictures` or `<folder>/results/` | ComfyUI workflows (Export (API) format), a field per text box found (positive / negative), Run / Cancel, results (§5b) |
| `vcs` | vcs | `.version-control/<key>.git` (bare, blob-less Git copy) | Files and History of a Git or SVN repository, read only (§5b) |

All markdown layouts share helpers in `views.js` (`fmMeta`, `fmSet`, `layoutBar`, `newPageWith`): they read and change only
single front-matter values, so the page text stays as written. The gallery also lists and plays video and audio (`items::media_kind`).

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

### 5b. Tabs that talk to other programs (1.0.1)

- **ComfyUI** (`pw-server::comfyui`): `GET …/comfyui/workflows`, upload (only the API format; otherwise the error names
  *Export (API)*), `PUT …/workflows/{name}/label`, `POST …/run` (sends the prompt with the changed texts to `url:`),
  `GET …/run/{id}` (status; downloads each result once through ComfyUI's `/view`), `POST …/run/{id}/cancel`,
  `GET …/results`, `POST …/results/delete`. `find_fields` detects the text boxes and whether they are positive or negative.
- **Version Control** (`pw-server::vcs`): settings `type` (git/svn), `protocol` (git: http, https, ssh; svn: svn, http, https),
  `server`, `port`, `path`, `user`, `password` or `key` (as `${secret:…}`). Git: a bare `--filter=blob:none` clone into
  `.version-control/<key>.git`, fetched at most once a minute (`?refresh=1` forces it); hooks and fsmonitor off,
  `protocol.file.allow=never`; the password reaches Git only through a credential helper that reads an environment variable
  while the command runs; ssh keys go into a short-lived `ssh-agent` on stdin. SVN: `--non-interactive --no-auth-cache
  --password-from-stdin`. Self-made https certificates are accepted. Error texts have the password masked.
  Routes `GET …/vcs/files`, `…/vcs/file?path=`, `…/vcs/history?path=`. Nothing is ever written to the repository.

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

### MCP programs (`programs:`, `pw-core::programs`, 1.0.1)

`programs: [blender, unity, unreal, godot, openscad, freecad]` in `project.yaml` (or *Manage → MCP*, `PUT /api/projects/{p}/programs`)
switches on ready-made MCP servers for the chat. Each turn writes a temporary `--mcp-config` file with those servers
(Blender `uvx blender-mcp`, Unity `http://localhost:8080/mcp`, Unreal `http://127.0.0.1:8000/mcp`, Godot `uvx godot-ai attach`,
OpenSCAD `uvx openscad-mcp`, FreeCAD `freecad-mcp` with `FREECAD_MODE=xmlrpc`) and tells Claude in the prompt to save results
in the project folder named after the program (created by the app). Unknown names give a note in the chat and are ignored.
Every MCP has a wiki page (`MCP-<Program>.md`) with what it needs and how to connect.

### LM Studio (`engine: lmstudio`, 1.0.1)

The chat can use a local model through LM Studio's OpenAI-style API (`url`, default `http://127.0.0.1:1234`; `model`).
`chat.rs` `lm_turn` streams the answer and offers the model the app's own tools — read_file, write_file, delete_file
(to `.trash`), list_files, run_command — shown in the chat like Claude's (Read, Write, Delete, LS, Bash). Permissions work
like Claude's: `read-only` refuses changes, `auto` allows file changes but asks for commands, `ask` asks for everything that
changes something. The conversation is kept in the chat file (`lmHistory`). Clear errors when LM Studio is not reachable or
no model is loaded.

### Workspace MCP server (`workspace-server mcp`)

This is a stdio JSON-RPC server inside the program (`pw-server::mcp`). Register it once (the home page shows the exact command):

```
claude mcp add project-workspace --scope user -- "<folder>\Workspace.exe" mcp
```

Tools: `list_projects`, `get_project`, `create_project`, `update_project_yaml`, `list_features`, `save_feature`, `list_items`, `read_item`, `create_item`, `write_item`, `backlinks`, `search`.

## 7. The app

### Server (`pw-server`, Rust: axum + tokio)

It binds to `127.0.0.1:4321` (next free port if taken; override with `PORT`). The routes are in `rust/crates/pw-server/src/lib.rs`.

| Route | Purpose |
|---|---|
| `GET /api/info` | version, paths, stores, layouts, field types, feature notices |
| `GET /api/claude` | `claude --version` check |
| `GET /api/search?q=&project=` | full-text search |
| `GET /api/features`, `PUT/DELETE /api/features/<key>` | feature definitions |
| `GET/POST /api/builtin-features`, `DELETE /api/feature-notes` | restore built-in features, clear the update notices (§4b) |
| `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/<p>` | projects (PATCH `{name, folder}` = rename) |
| `PUT /api/projects/<p>/yaml` | save project.yaml (validated) |
| `PUT /api/projects/<p>/programs`, `PUT /api/projects/<p>/dashboard` | MCP programs, dashboard blocks |
| `POST /api/projects/<p>/features`, `POST …/features/<k>/use-new` | add a feature, switch a tab to the new built-in version |
| `GET /api/projects/<p>/overview`, `…/index`, `…/backlinks?feature=&id=` | overview, every linkable item, "mentioned in" |
| `POST /api/examples` | add the example projects |
| `POST /api/projects/<p>/archive`, `GET /api/archive`, `POST /api/archive/<slug>/restore` | archive and restore |
| `GET/POST /api/projects/<p>/f/<feature>/items`, `GET/PUT/DELETE …/items/<id>` | items (delete = move to `.trash`) |
| `POST …/upload?folder=&filename=[&map=1]`, `POST …/trash` | upload (raw body), move a file to trash |
| `POST …/chat`, `GET …/chat/<id>`, `POST …/chat/<id>/stop`, `POST /api/chat-permission/<turn>[/<q>/answer]` | chat (SSE), live state, stop, permission questions |
| `GET …/github?state=&refresh=` | issues (GitHub or Forgejo) |
| `…/tickets…` | GLPI tickets (screen 7a) |
| `…/comfyui/…`, `…/vcs/…` | ComfyUI and Version Control (§5b) |
| `GET /api/help`, `/api/help/page/<name>`, `/api/help/search?q=`, `/help-img/<file>` | help inside the app |
| `GET /api/fs/tree`, `GET/PUT /api/fs/file`, `POST /api/fs/mkdir`, `…/rename`, `…/trash`, `…/upload`, `GET /api/fs/raw`, `POST /api/fs/vscode` (all with `?scope=workspace` or `?scope=p/<project>` and `&path=`) | explorer, open in VS Code |
| `GET /api/ide`, `POST /api/ide/start`, `GET /api/projects/<p>/ide`, `/ide/…` (HTTP + WebSockets) | in-app VS Code and its proxy |
| `GET /api/due?days=` | what is due in all projects (home page, tray reminders) |
| `GET /api/templates`, `POST /api/projects/<p>/template` | templates |
| `GET/DELETE /api/secrets`, `PUT/DELETE /api/secrets/<name>` | secrets (names only are ever sent back) |
| `GET /api/update`, `POST /api/update/check`, `…/skip`, `…/later`, `…/apply` | updates (7b) |
| `POST /api/open-url` | open a link in the system browser (desktop window) |
| `GET /api/events` | live refresh (server-sent events from a file watcher) |
| `GET /files/<p>/<path>` | raw project files (images, downloads) |

Safety:
- Every path goes through `safeJoin`, which refuses anything outside the project folder.
- Ids are checked against a strict pattern.
- Requests whose `Host` is not localhost are refused (protects against DNS rebinding).
- Write requests from other websites are refused through an `Origin` check (protects against CSRF).
- Deleting only ever moves items to `.trash/`.

### User interface (`app/public/`)

Vanilla JavaScript with no build step and no framework. **The look is fixed:** new screens reuse the existing classes in `app.css` (`card`, `row`, `btn`, `chip`, `seg`, `split`/`ilist`/`pane`, `list-rows`/`lrow`, `empty`, `note`, …) — see `docs/LAYOUT-AND-DESIGN.md`.
- `core.js`: helpers, icons, the Markdown renderer, modals and record forms.
- `views.js`: one render function per layout.
- `app.js`: sidebar, routing, home, project page, features, new project, search and live refresh.

Screens (from the accepted mockup, issue #2):

1. **Workspace home:** *Coming up in all projects* (overdue tasks first, next 14 days), project cards with feature chips and counts, archived projects, the Claude CLI command for the workspace MCP server.
2. **Project page:** an **Overview** tab first (the project's **dashboard** on top — blocks of `what` (a feature), `show` number or list, `filter` (`field=value`, `field!=value` or a word), `count`, place `x`/`y` and size `w` 1–4 / `h` 1–3, edited with **Edit** (add, remove, drag to move, drag the corner to resize), saved under `dashboard:` in project.yaml; then a tile per feature with its count, *coming up* in the next 30 days from every date field, open Kanban tasks with overdue ones marked, recently changed items; hide it with `overview: false` in project.yaml), then a tab per feature from `project.yaml`, a note saying which `features/*.yaml` defines it, and the `project.yaml` editor, opened from the gear (Manage) menu (#87; it shows as a tab only while open). A **Tabs** button hides tabs per project: `hide_tabs: [keys]` in project.yaml, a project setting like `overview:` (#89). Two layouts (#90), switched in the menu and kept in the browser's storage (`pw-layout`, like the theme): *menu left* (sidebar, feature tabs on top) and *menu top* (`html.layout-top`: the sidebar becomes a top bar with a project drop-down, the feature tabs become a list on the left that collapses to icons, `pw-ftabs`). Below 900 px both use the phone menu. Checked in Chromium and WebKit by `tests/ui/layout.test.js`.
3. **Features:** list, YAML editor with validation, a sketch of the layout, fields, and which projects use it.
4. **New project:** name, *Start from* a template or blank, feature tick boxes, and a live `project.yaml` preview you can edit.
5. **Search** across all projects.
5b. **Secrets** (sidebar): names of the stored secrets, add/replace/delete, which protection is in use (7e).
5c. **Project tabs**: features, Explorer, VS Code and project.yaml; tabs that don't fit go into a **More** menu (the open tab stays visible), **+** adds a feature.
5d. **Manage** (gear icon in the project header): the project folder (copy path, copy the Claude CLI command, open in VS Code), rename (optionally the folder too), remove features from the project (files stay), save as template (7f), archive (moves the folder to `projects/_archive/`, hidden from the list; *Archived projects* on the home page restores or deletes them), delete (type the name to confirm; deletes `projects/<slug>` only).
6. **Explorer:** every project has an *Explorer* tab with the whole project folder as a tree (incl. `project.yaml`, `.claude/`, `.mcp.json`), and the sidebar has a workspace explorer (features + all projects). Text files open in the code editor (Markdown with preview, images shown); new file/folder, upload, rename/move, delete (to `.trash`), download. Saving a `project.yaml` or feature YAML is validated first.
7a. **Ticket (GLPI, 1.0):** feature `stores: glpi`, layout `tickets` (`app/starter/features/ticketsystem.yaml`). `pw-server::glpi` talks to GLPI 11's REST API (`apirest.php`): per request it opens a session with the user token (+ app token), finds the ITIL category with the project's name or creates it, and works only on tickets of that category (others answer 404); then it closes the session. Settings `url`, `user`, `user_token`, `app_token` come from the feature in `project.yaml`, the tokens as `${secret:…}`. Addresses: `GET/POST /api/projects/{p}/f/{f}/tickets`, `GET/PATCH …/tickets/{id}`, `POST …/tickets/{id}/followups|solution`. Rich text from GLPI is shown as plain text. Tests: `tests/contract/tickets.test.js` (fake GLPI), plan check `docs/plans/checks/glpi-check.js` (real test server). Plan: [plans/TICKETSYSTEM.md](plans/TICKETSYSTEM.md).
7b. **Help** (route `#/help[/<page>]`): the wiki pages inside the app with a search (`pw-server::help`; pages from `app/help/pages`, in a development folder `docs/wiki`). Wiki links stay in the app, GitHub screenshot links are served from `/help-img/`. The **(i)** next to a feature shows its info line on hover and opens its page in a side panel (`helpPanel`).
7. **VS Code tab (full VS Code in the app):** (values in `settings.yaml` are quoted: a value starting with `{` would be read as a YAML mapping; files from older versions are repaired on read) shows the browser version of VS Code, opened on the project folder, in an embedded frame. From 1.0 the tab starts it by itself when it is opened (no button; "VS Code is starting…" meanwhile), shows only the editor, and says "VS Code is not installed" with the download link when the `code` command is missing ([plans/VSCODE.md](plans/VSCODE.md)). By default the app starts the installed VS Code's own web server (`code serve-web --server-base-path /ide`, downloads its web part once) on `127.0.0.1:8740` with a random connection token (kept in `data/.ide-token`), and stops it when the app exits. Starting is safe against double clicks and timing (#104): a second start waits for the first; when the port is already taken (a VS Code still getting ready), no second one is started; the editor is shown only when VS Code's own page answers with the token (not just the port); and the open VS Code tab is not rebuilt when files in the project change. The browser never talks to that port directly: the app **reverse-proxies `/ide/…` (HTTP and WebSockets)** on its own address and removes frame-blocking headers, so the embedded VS Code is same-site and browsers don't block it (#30). Settings from v0.3.0 (direct `http://{host}:{port}` URLs) are upgraded automatically; code-server, which serves at its root, uses `strip_base: true`. The command, port and URL are set in `data/settings.yaml` (`ide:`), so code-server or OpenVSCode Server can be used instead. (Before 1.0 a row of buttons — Reload, Open in new window, Desktop VS Code, Stop — was shown above the editor; it was removed by decision.)
8. **VS Code buttons:** *Open in VS Code* in Manage and on every file run the `code` command (`VSCODE_COMMAND` to override) to open the project folder in the installed VS Code and jump to the file. If `code` is not on the PATH the browser is asked to open a `vscode://file/…` link.

- **Theme:** light, dark or auto (follows the OS), one toggle button in the sidebar (Light → Dark → Auto), remembered in `localStorage`. Next to it one toggle button for the layout (menu left / menu top). In the menu-left layout, more than 4 projects are shown in the project drop-down instead of the list (`many-projects` class; not when collapsed to icons or on small screens).
- **Sidebar:** can be collapsed to icons and project avatars (button at the bottom, or Ctrl+B), remembered in `localStorage`.
- **Live refresh:** when files change on disk (by hand or by Claude), the open view reloads, unless you are editing.

## 7b. Updates

Live installations never use git; they are updated from **GitHub Releases** (#26, `pw-server::updater`).

- **Weekly check:** the server asks `https://api.github.com/repos/GFGMNET/Workspace/releases/latest` (public, no login, nothing sent about the client) at most once a week, and the UI shows the result. The last check, the latest release, *skip* and *later* are stored in `data/.workspace.json`. Turn checking off with `updates: check: false` in `data/settings.yaml`; `updates: repo:` points to another repository.
- **Versions (decided 2026-11-25):** a normal version (1.0.1, 1.0.2) is released by the release rule (CLAUDE.md); a serious bug gets an **urgent fix version with four numbers** (1.0.0.1, 1.0.1.1). The update check compares **all four numbers** (`parse_v`, #123). Test betas are GitHub **pre-releases**, which `releases/latest` never returns, so installed apps never get them.
- **Banner:** *Version X is available* · **What's new** (the *In short* part of the release notes, with "back up your data folder" first) · **Update now** · **Later** (a week) · **Skip this version**.
- **Update now:** downloads the zip for this platform, checks it (Windows: the Authenticode signature must be the project's own certificate — fingerprint built in — and the file unchanged; Linux: SHA-256 from the release's `SHA256SUMS`), moves the current program into `.update/backup-<version>-<time>/`, and after the app has quit a small script puts the new program in place and starts it again. `data/`, `.update/` and `.git/` are never touched. If anything fails, the old program is put back.
- **Releases** are made by `.github/workflows/build-rust.yml` (inputs `version`, `final`): it builds and tests on Windows and Linux, signs the Windows programs, builds the help pages, writes `SHA256SUMS` and build attestations, and publishes the release with the notes from `docs/releases/vX.Y.Z.md`. Without `final` it is a pre-release (beta).

## 7c. Desktop app (Windows 11 and Linux, `pw-app`, Tauri 2)

The desktop app runs the server in the same program and shows `http://localhost:<port>` in a window that uses the system's
browser engine (WebView2 on Windows, WebKitGTK 4.1 on Linux). Nothing else to install.

- One instance (a second start focuses the window); window size in `data/.window.json`; the window's **X quits** the app.
- Options: a port number, `--browser` (normal browser tab instead), `--hidden` (start in the tray), `--version`, `mcp`.
- Workspace pages stay in the window; other links open in the system browser (`/api/open-url`). The page gets no Tauri commands (capabilities: none).
- **Tray, reminders, autostart** (settings in `data/.desktop.json`): a tray icon with the due items (a click opens one); every 30 minutes `GET /api/due?days=1` and a notification for items due today or overdue (once per item and date); *Start with the computer*.
- Linux without a desktop: `workspace-server` (no WebKitGTK needed).

## 7e. Secrets

`pw-core::secrets`. `data/.secrets.json` holds `{ key, items: { name: { iv, tag, data, updated } } }`; each value is
AES-256-GCM encrypted with a random 32-byte key. The key is protected by the operating system when possible: Windows DPAPI
(`protected: dpapi`, for this Windows user), Linux keyring through the desktop app (`protected: keyring`); otherwise it is kept as is
(`protected: none`, shown in the dialog) and upgraded as soon as it can be. A key that can't be decrypted (other computer/user) makes
the secrets *locked*: they can be removed and entered again. Keys of the 0.x app (Electron safeStorage) are taken over on Windows.

- In YAML: `${secret:name}`. `writeMcpJson` turns it into `${PW_SECRET_NAME}` (Claude CLI expands environment
  variables in `.mcp.json`); the chat passes exactly the secrets referenced there as environment variables.
  Settings the app uses itself (GLPI tokens, Forgejo token, Version Control password/key) are resolved only while a request runs and never written anywhere.
  `settings.yaml` values the app uses itself (`github: token:`) are resolved directly (`secrets.resolve`).
- API: `GET /api/secrets` (names only), `PUT /api/secrets/<name> {value}`, `DELETE /api/secrets/<name>`, `DELETE /api/secrets`.
- `.secrets.json`, `.ide-token` and `.app/` are private: the explorer (`pw-core::files`) neither lists nor opens them, and `/files/` never serves them.

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
only the local workspace and gets no Tauri commands; other links open in the system browser.

**What we ship, and how it stays current**

| Component | Source of CVEs | How it is kept current |
|---|---|---|
| Browser engine | — | not shipped: WebView2 (Windows Update) and WebKitGTK (the Linux distribution) |
| Rust crates | few | `rust/Cargo.lock` committed, builds `--locked`; `cargo-deny` (`.github/workflows/rust-security.yml`, `rust/deny.toml`) on every change and every Monday; a finding opens an issue `security-check`; fixed with *Rust lock update* |
| Bundled JS libraries (Mermaid, highlight.js) | few | `tools/vendor.json`; `security.yml` (*Bundled libraries*) checks npm for newer versions and advisories → issue |
| Our own code | logic mistakes | CodeQL (`codeql.yml`, every push and weekly); contract tests on Windows + Linux |
| Build workflows | supply chain | Dependabot (`.github/dependabot.yml`) for GitHub Actions |

**Security gate (decided 2026-11-24):** no release while the Rust security check or CodeQL is not green.

**Reporting:** `SECURITY.md` — private reports through GitHub (*Security → Report a vulnerability*, switched on). Only the latest release gets fixes.
Labels (2026-11-25): `security` only for a real security problem (one issue per problem); the automatic message of the Rust
security check gets `security-check`. Public list: wiki *Known security issues*.

**Signing:** Windows programs are signed with the project's own certificate (`signing/`, plans/SIGNING.md); the updater accepts only that fingerprint.

## 7a. Documentation

| Document | For whom | Where |
|---|---|---|
| `README.md` | first look, start, update | repo root |
| `docs/GETTING-STARTED.md` | new users: install, first project, first feature, Claude, VS Code, updating | repo + wiki *Getting-Started* |
| `docs/wiki/*.md` | user guide: projects, features (all settings), **a page per starter feature** (`Feature-<Name>.md`: all its options, examples, what it stores), building blocks, Claude, VS Code & Explorer, data & updates, FAQ | GitHub wiki |
| Help in the app | *Help & wiki* in the sidebar (all wiki pages, offline, with search); the (i) on every feature opens its page in a side panel | `app/help/pages` (from `docs/wiki` at release) |
| `CLAUDE.md`, `AGENTS.md`, `docs/HANDOVER.md`, `docs/TRANSFER-CHECKLIST.md`, `docs/NOT-REQUESTED-2026-11-26.md`, `docs/FORGOTTEN-2026-11-26.md`, `docs/AGENT-GUIDE.md`, `docs/LAYOUT-AND-DESIGN.md`, `docs/SKILLS.md` | AI assistants and new developers: rules, decisions, where things stand, how to build, the fixed look | repo |
| `docs/DESIGN.md` | developers: architecture and rebuild guide | repo + wiki *Design* |
| `docs/REQUIREMENTS.md` | everyone: every requirement with status and issue | repo + wiki *Requirements* |

The GitHub wiki is **generated**: `tools/build-wiki.js` copies `docs/wiki/` and turns the three documents above into wiki pages (links and screenshots rewritten). The workflow `.github/workflows/wiki.yml` runs it on every push to `main` that touches `docs/` and pushes the result to the wiki. Edit the files in `docs/`, never in the wiki itself. One-time setup: the first wiki page must be created on GitHub once, because GitHub only creates the wiki repository then.

**Wiki pages filled in automatically (2026-11-25).** The wiki workflow also runs once a day and when an issue with one of the labels below is opened, changed, closed or (un)labelled, and fills tables on the built
pages only (never on `main`; the copies in `docs/` keep a placeholder row that says so):

| Wiki page | Filled by | From |
|---|---|---|
| Vote for features | `tools/vote-counts.js` (`<!-- votes:start/end -->`) | open issues with label `vote` created by GFGMNET, 👍/👎 on the first post |
| Known bugs | `tools/issue-list.js` (`<!-- list:start/end -->`) | all issues with label `bug` (open / fixed with milestone / closed) |
| Known hiccups | `tools/issue-list.js` | all issues with label `hiccup` |
| Known security issues | `tools/issue-list.js` | all issues with label `security` (fixed / open — being fixed / not fixed) |

**Issues from users:** the form *New idea* (`.github/ISSUE_TEMPLATE/new-idea.yml`: short name, what it should do, why, "I checked
the idea list") gives the label `idea`; normal issues stay possible. The maintainer decides bug or hiccup and sets the label. `duplicate-check.yml` compares a new idea with open ideas and votes, and a bug (when the label `bug` is set) with all bugs, by the words of the title (prefixes like "Idea:" ignored, 40 % alike); it comments the matches and adds `possible-duplicate`.

**Workflow flowcharts:** made by the maintainer himself (2026-11-25).

**Pages for coming versions** wait in `docs/wiki-next/vX.Y.Z/`; the release of that version moves them into `docs/wiki/`. The README after the next release is `docs/readme-next/README.md`.

## 7d. YAML

All YAML (project.yaml, features, records, settings.yaml) is read by `pw-core::yaml` (`yaml-rust2`, plus our own code for merge keys and several documents) — the same results as the 0.x reader (eemeli/yaml), checked by the YAML corpus. It is full YAML 1.2 plus merge keys:
- anchors and aliases
- `<<:` merges
- block (`|`, `>`) and flow styles
- tags
- several documents in one file, whose mappings are merged in order

Values follow YAML 1.2, so `2026-11-18`, `00:11:22:33:44:55` and `yes` stay text. Errors are reported as `Line X, column Y: …`.

- **Lenient fallback:** a file that isn't valid YAML is tried once more with the forgiving reader (`pw-core::lenient`), so hand-written files like the original example (` wiki:` indented by one space) still open. The project page and the Features page then show a warning asking to fix the file.
- **Comments stay:** saving a record from a form only rewrites the changed values (`update_mapping`), keeping its comments, key order and style. Adding a feature appends text to project.yaml, and renaming changes only the `name:` line.

## 8. Decisions

| Topic | Decision |
|---|---|
| Storage | Plain files only, no database |
| Project definition | `project.yaml` lists which features a project has |
| Feature definition | YAML files in `features/` at the workspace root |
| New feature types | Added as YAML, no code; new building blocks need an app change |
| Building blocks | pages, cards, list, journal, book, notes, board, table, blog, grid, files, code, kanban, calendar, orgchart, map, diagram, chat, issues, tickets, comfyui, vcs |
| Map | Offline image with pins |
| Diagram | Mermaid text |
| Chat | Claude CLI (or LM Studio) in the project folder; permissions per project; MCP programs per project |
| Theme | Light, dark, or follow the OS |
| App format | Rust + Tauri desktop app for Windows 11 x64 and Linux x64, built by GitHub Actions; `workspace-server` for machines without a desktop. No macOS, no arm64, no Windows 10 (#56, #64, #73) |
| Licence | MIT (#13) |
| Updates | Program and client data are separate (`data/`) (#17); weekly check of GitHub Releases with one-click update, backup and restart (#26) |
| Dependencies | None to install: Mermaid and highlight.js are bundled; the browser engine is the system's |
| Security | cargo-deny, CodeQL, Dependabot, own signing certificate; no bundled browser engine (7g, 10, #41) |
| YAML | Full YAML 1.2 (bundled library) with a lenient fallback and a warning for non-standard files (#12) |
| Documentation | Getting started guide + GitHub wiki generated from `docs/` (#25) |
| Developing the tool | It can manage itself: the example project *Workspace (development)* uses `location: "{install}"` with docs, scripts, GitHub issues, chat and a *release* skill (#27–#29) |

## 8b. Tests

| What | Where | Runs |
|---|---|---|
| Unit checks (0.x logic, screens' syntax, example data) | `app/test/smoke.js` (`npm test`) | every push |
| Rust unit tests | `cargo test -p pw-core -p pw-server` | every push to `rust/`, every build |
| API contract tests: every route, answers, errors, files on disk, security checks, chat stream with a fake Claude CLI, fakes for GitHub, updates and VS Code, the MCP server | `tests/contract/` (`npm run test:contract`) | every push, Linux + Windows |
| YAML corpus: how each file is read (golden answers), comments kept on update | `tests/yaml-corpus/` (`npm run test:yaml`; regenerate with `tools/yaml-golden.js`) | every push |
| VS Code tab with the real `code serve-web` | *VS Code tab check* workflow | by hand |

The contract tests and the corpus test any implementation: `PW_SERVER_CMD="… {port}"`, `PW_MCP_CMD`, `PW_YAML_CMD` (set by `rust.yml` to the Rust binaries). Tests for features that only exist in Rust use `{ skip: !process.env.PW_SERVER_CMD }`. Rust can't be built in Claude's environment: push and read the GitHub job logs.

## 9. Rebuilding it

```
git clone https://github.com/GFGMNET/Workspace
cd Workspace/rust
cargo build --release --locked           # needs Rust; on Linux also the WebKitGTK 4.1 development packages
cd .. && PW_SERVER_CMD="rust/target/release/workspace-server {port}" npm run test:contract
```

Or push to `main` and let `.github/workflows/rust.yml` build and test on Linux and Windows.

To port it to another stack, keep these contracts:
- **Folder layout** (section 2)
- **`project.yaml` rules** (section 3)
- **Feature settings** (section 4)
- **On-disk format per building block** (section 5)
- **Claude CLI flags** (section 6)

The UI can be rebuilt freely on top of the API in section 7.

## 9b. Planned features

All plans up to 1.0.1 are built and released (README *Upcoming changes*, docs/plans/). New features follow the plan rules in
CLAUDE.md (8-part plan → checks in `plans/checks/` → *Ready 2 Deploy* → next version).

| Version | Feature | Plan | Issue |
|---|---|---|---|
| 1.0 ✅ | Ticket tab (GLPI 11), VS Code opens by itself, own signing certificate | [TICKETSYSTEM](plans/TICKETSYSTEM.md), [VSCODE](plans/VSCODE.md), [SIGNING](plans/SIGNING.md) | #59, #105, #49 |
| 1.0.1 ✅ | Built-in features, Version Control, ComfyUI, Forgejo, text layouts, MCPs (6), LM Studio, Help, Dashboard | [plans/](plans/) | #60, #93–#96, #100, #109–#116 |
| later | VS Code tab: focused layout (editor + explorer) | | #62 |
| later | Version Control: write and push (an upgrade, own plan) | | |
| — | macOS app | ❌ not planned (2026-11-18) | #56 |
| — | Feature requests from users | paused for a review (2026-11-23) | |

## 10. Version 1.0: Rust + Tauri (released 26 Nov 2026, #41)

The detailed plan (inventory, crates, phases with exit criteria, tests, risks, decisions) is in [MIGRATION-RUST.md](MIGRATION-RUST.md); milestone *v1.0 (Rust)*, issues #49–#55.

**Status:** all phases ✅ — 1.0.0 and 1.0.1 are released. The Rust server passes the whole API contract suite (incl. chat, VS Code proxy, updates,
GitHub issues, MCP server) and the YAML corpus (33/33) on Linux and Windows. 1.0 is built for **Windows 11 x64 and Linux x64** only:
no Windows 10 (#73), no arm64 (#64), no macOS (#56) — decided 2026-11-18.
The code is in `rust/`; the plan and status: [MIGRATION-RUST.md](MIGRATION-RUST.md).

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
  pw-core     yaml (+ lenient reader, comment-keeping updates), workspace (features, projects, STORES, layouts, META_KEYS),
              items (all storage types, uploads, photo dates, media), files (explorer), links (search, backlinks, overview, due),
              projects (create, rename, archive, templates, programs, dashboard), secrets (AES-256-GCM; DPAPI / keyring),
              builtin (restore and update built-in features), programs (the MCP programs)
  pw-server   axum + tokio: routes (lib.rs); live refresh (live.rs); chat (Claude CLI + permission helper, LM Studio);
              VS Code proxy incl. WebSockets (ide.rs); updater; GitHub + Forgejo issues (github.rs); GLPI (glpi.rs);
              ComfyUI (comfyui.rs); Version Control (vcs.rs); help (help.rs); the workspace MCP server (mcp.rs).
              Binary: workspace-server (no window, no WebKitGTK needed)
  pw-app      Tauri 2: window on http://localhost:<port>, tray, reminders, autostart, single instance, window size;
              no Tauri IPC commands for the page (capabilities: none). Binary: Workspace.exe / workspace
app/public    the screens, served by pw-server
```

**Choices made in the prototype**
- YAML: `yaml-rust2`, plus our own forgiving reader for sloppy files and a text-level, comment-keeping update of records.
  Merge keys, anchors and several documents behave as in 0.x (YAML corpus 33/33).
- The page is loaded from `http://localhost` inside WebView2/WebKitGTK; the VS Code tab (iframe, WebSockets), Mermaid, drag & drop
  and paste work.
- Linux: WebKitGTK 4.1 must be installed (most desktops have it); `workspace-server` has no such need. Both binaries are built on
  Ubuntu 24.04 and need **glibc 2.39 or newer** (Ubuntu 24.04, Mint 22, Debian 13, Fedora 40, RHEL 10, up-to-date Arch …;
  not Ubuntu 22.04 / Debian 12) — kept as it is (maintainer, 2026-11-25), listed in the FAQ with the check `ldd --version`.
- Windows 10 is not supported (decided 2026-11-18, #73); Windows 11 always has WebView2.

**Security work that comes with it**
- rustls instead of OpenSSL, minimal crate features ✅. `cargo-deny` checks vulnerabilities, licences and sources on every change
  and every Monday (`.github/workflows/rust-security.yml`, `rust/deny.toml`; a weekly finding opens an issue with the label `security-check`) ✅; `rust/Cargo.lock` is
  committed and builds use `--locked` ✅ (#72). Weekly check like 7g, for crates.
- **Trusted releases:** Windows programs are signed with the project's own certificate ([plans/SIGNING.md](plans/SIGNING.md)):
  `signing/` holds the certificate with its key (no password), the public part and the fingerprint; `build-rust.yml` signs with it; the updater (`updater.rs` `check_signature`, 0.x `updater.js`) accepts only that fingerprint and an
  unchanged file. Windows reports "not trusted" until the certificate is installed (wiki: Signing certificate).
- The security check of 7g then watches crates and the bundled JS libraries; there is no browser engine of our own to patch.

**Moving from 0.x** (#74, shipped in 0.6.3): the 0.x updater recognises the 1.0 package, checks it like 1.0 does and swaps the program; `data/` stays. Wiki: *Moving to 1.0*.

**Phases**
0. ✅ **API contract tests:** move the HTTP-level checks into a test suite that runs against a server URL, and run it against today's
   Node server. The Rust server must pass the same suite.
1. ✅ **Prototype** (Windows + Linux): Tauri window, project list, wiki feature, YAML reading incl. the sloppy example, VS Code tab.
   → Decision: go / no go.
2. ✅ **Core:** everything in `pw-core` with the contract tests green.
3. ✅ **The rest:** chat, VS Code proxy, MCP server, updater with signatures, secrets, desktop extras (tray, reminders, autostart).
4. ✅ **Beta** (0.9.0.x – 0.9.1.x, tested by the maintainer).
5. ✅ **1.0.0** (26 Nov 2026): the 0.x apps are offered the update. **1.0.1** followed the same day.

