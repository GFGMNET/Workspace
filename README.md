# Project Workspace

One workspace for very different projects. A project's `project.yaml` says **which features** it has, and `features/*.yaml` says **what they mean**. There is no database; everything is plain files. It works with **Claude CLI**: you can chat inside a project, and skills, MCP connections and a workspace MCP server are included.

![Workspace home](docs/screenshots/home.png)

## Version 1.0 is coming: **Workspace**

The app is being rebuilt in Rust. It uses the browser engine of your system instead of shipping its own, so the download is about 10 MB instead of 157 MB, with far fewer security updates. The name becomes simply **Workspace**. Everything else stays: the same screens, the same `data/` folder, the same files.

- Runs on **Windows 11 (x64)** and **Linux (x64)**. Not supported: Windows 10, ARM (e.g. Raspberry Pi), macOS.
- Try the beta: [pre-releases](https://github.com/GFGMNET/Workspace/releases) (`workspace-v0.9…`), steps in the wiki: [Beta of 1.0](https://github.com/GFGMNET/Workspace/wiki/Beta-1.0). Work on a **copy** of your data folder.
- Status and plan: [docs/MIGRATION-RUST.md](docs/MIGRATION-RUST.md). The Windows program is signed — [Code signing policy](CODE-SIGNING-POLICY.md). Installed 0.x apps are offered 1.0 when it is released.

## Start (current version 0.x)

**Nothing to install:** download the package for your system from the [latest release](https://github.com/GFGMNET/Workspace/releases/latest) and unzip it:

| System | Download | Start |
|---|---|---|
| Windows | `project-workspace-…-windows-x64.zip` | double-click **ProjectWorkspace.exe** |
| Linux (PC) | `project-workspace-…-linux-x64.zip` | `./project-workspace` |
| Linux (ARM, e.g. Raspberry Pi) | `project-workspace-…-linux-arm64.zip` | `./project-workspace` |
| Linux server without a desktop | the Linux zip | `./project-workspace-server` |

The workspace opens in its own app window.

**With Node.js** (18 or newer, any system; not in 1.0):

- **Windows:** double-click `start.bat`
- **Linux:** `./start.sh`
- or run `node app/server.js` yourself, then open http://localhost:4321

On the first start a `data/` folder is created for your projects. The home page offers to add the example projects.

**Updating:** the app checks GitHub once a week and offers new versions with one click (*Update now*), keeping a backup and never touching `data/`. By hand: replace everything **except the `data/` folder**.

The chat feature also needs [Claude CLI](https://docs.claude.com/en/docs/claude-code), installed and signed in (`claude` in a terminal).

## How it works

```yaml
# data/projects/test/project.yaml
name: test
wiki:
  - a wiki page
knowledge:
  - a knowledge base
gallery:
  - a picture gallery
```

```yaml
# data/features/wiki.yaml  — defined once, used by every project that says "wiki:"
name: Wiki
stores: markdown
layout: pages
search: true
```

Each feature key becomes a tab on the project page. The content lives in the project folder (`projects/test/wiki/a-wiki-page.md`, …), so you can edit it in any editor or have Claude edit it.

**Building blocks:** pages · cards · list · picture grid · files · scripts (code editor) · table · kanban · calendar · org chart · offline map (your own image with pins) · Mermaid diagrams · chat with Claude CLI.

Every project also has an **Overview**, an **Explorer** with all its files, and the full **VS Code** in a tab. The gear icon (**Manage**) holds the project folder (copy path, Claude CLI command, open in the installed VS Code), rename, features, templates, archive and delete. Tabs that don't fit go into **More**. A project can live in an existing folder (`location:`), so the workspace can even manage itself: see the example *Workspace (development)*.

**Also:** projects can be renamed, archived and saved as **templates**; the home page shows what's **coming up in all projects**; API keys and passwords are kept as encrypted **secrets** (`${secret:name}` in YAML); the desktop app has a **tray icon, reminders** and can start with the computer.

**Starter features:** wiki, knowledge, gallery, files, scripts, skills, mcp, chat, tasks, calendar, team, map, diagrams, contacts, devices, github (issues). You can add your own under *Features → New feature*, by copying a YAML file, or by asking Claude.

| | |
|---|---|
| ![Wiki](docs/screenshots/wiki.png) | ![Kanban](docs/screenshots/kanban.png) |
| ![Map](docs/screenshots/map.png) | ![Chat](docs/screenshots/chat.png) |
| ![Features](docs/screenshots/features.png) | ![Diagram, dark mode](docs/screenshots/diagram-dark.png) |

## Claude CLI

- **Chat tab:** runs `claude` inside the project folder. Claude asks in the chat before it changes files or runs commands (*Allow*, *Always allow in this chat*, *Don't allow*); it keeps working when you go to another page, and *Stop* stops it. Permissions are set per project in `project.yaml`:
  ```yaml
  chat:
    permissions: ask    # ask | auto | read-only
  ```
- **Skills** are written to `.claude/skills/<name>/SKILL.md` and **MCP connections** to `.mcp.json`. Claude CLI picks both up when started in the project folder (*Manage → Copy Claude CLI command*).
- **Workspace MCP server:** lets Claude list, create and edit projects from anywhere:
  ```
  claude mcp add project-workspace --scope user -- node "C:\path\to\Workspace\app\mcp.js"
  ```
  With the desktop app, the home page shows the exact command for your folder. From 1.0 the program is its own MCP server: `claude mcp add project-workspace --scope user -- "C:\path\to\Workspace.exe" mcp`.

## More

- **New here?** [Getting started](docs/GETTING-STARTED.md) · [Wiki](https://github.com/GFGMNET/Workspace/wiki)
- Full design and rebuild guide: [docs/DESIGN.md](docs/DESIGN.md)
- Requirements and their status: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- Security, reporting a vulnerability: [SECURITY.md](SECURITY.md) · [Code signing policy](CODE-SIGNING-POLICY.md)
- Bugs and ideas: [Issues](https://github.com/GFGMNET/Workspace/issues)
- Tests: `npm test` (unit checks), `npm run test:contract` (API contract, also run against the Rust version), `npm run test:yaml`
- Settings (environment variables): `PORT` (default 4321), `WORKSPACE_DIR` (data folder, default `data/`), `CLAUDE_COMMAND` (default `claude`)

Bundled for offline use: Mermaid (MIT) for diagrams and highlight.js (BSD-3-Clause) for syntax colours in `app/public/vendor/`, and yaml (ISC) for full YAML support in `app/lib/vendor/yaml/`. Rebuild them with `tools/build-highlight.js` and `tools/vendor-yaml.js`.
