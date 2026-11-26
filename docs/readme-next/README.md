# Workspace

One workspace for very different projects. A project's `project.yaml` says **which features** it has, and `features/*.yaml` says **what they mean**. There is no database; everything is plain files. It works with **Claude CLI**: you can chat inside a project, and skills, MCP connections and a workspace MCP server are included.

![Workspace home](docs/screenshots/home.png)

**Version 1.0** is a complete rebuild in Rust: about 10 MB instead of 157 MB, faster, and far fewer security updates, because it uses the browser engine of your system (WebView2 on Windows, WebKitGTK on Linux). The old app (0.x, Electron) is retired — [moving from 0.x](https://github.com/GFGMNET/Workspace/wiki/Moving-to-1.0).

## Download and start

Download the zip for your system from the [latest release](https://github.com/GFGMNET/Workspace/releases/latest), unzip it into a folder of its own and start it:

| System | Download | Start |
|---|---|---|
| Windows 11 (x64) | `workspace-v…-windows-x64.zip` | double-click **Workspace.exe** |
| Linux (x64) | `workspace-v…-linux-x64.zip` | `./workspace` |
| Linux server without a desktop | the Linux zip | `./workspace-server` (then open http://localhost:4321) |

- **Not supported:** Windows 10, macOS, ARM computers (e.g. Raspberry Pi), older Linux (e.g. Ubuntu 22.04, Debian 12). Linux needs glibc 2.39 or newer (e.g. Ubuntu 24.04, Mint 22, Debian 13, Fedora 40, up-to-date Arch — full list in the FAQ), and WebKitGTK 4.1 for the window (most desktops have it).
- **Windows** shows a warning until you trust the project's own signing certificate once — [how to trust it](https://github.com/GFGMNET/Workspace/wiki/Signing-certificate) · [Code signing policy](CODE-SIGNING-POLICY.md).
- On the first start a `data/` folder is created next to the program for your projects. The home page offers to add the example projects.
- **Updating:** the app checks GitHub once a week and offers new versions with one click (*Update now*). Before updating, back up your `data/` folder — [Backup](https://github.com/GFGMNET/Workspace/wiki/Backup). By hand: replace everything **except the `data/` folder**.
- The chat feature needs [Claude CLI](https://docs.claude.com/en/docs/claude-code), installed and signed in (`claude` in a terminal).

## Upcoming changes

Nothing is planned yet. Ideas you can vote for: [Vote for features](https://github.com/GFGMNET/Workspace/wiki/Vote-for-features). What came with each version: [releases](https://github.com/GFGMNET/Workspace/releases).

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

**Building blocks:** pages · cards · list · journal · book · sticky notes · board · blog · picture and video grid · files · scripts (code editor) · table · kanban · calendar · org chart · offline map (your own image with pins) · Mermaid diagrams · chat with Claude CLI or LM Studio · ComfyUI · Version Control (Git, SVN).

Every project also has an **Overview** (with its own dashboard), an **Explorer** with all its files, and the full **VS Code** in a tab. The gear icon (**Manage**) holds the project folder (copy path, Claude CLI command, open in the installed VS Code), rename, features, templates, archive and delete. Tabs that don't fit go into **More**. A project can live in an existing folder (`location:`), so the workspace can even manage itself: see the example *Workspace (development)*.

**Also:** projects can be renamed, archived and saved as **templates**; the home page shows what's **coming up in all projects**; API keys and passwords are kept as encrypted **secrets** (`${secret:name}` in YAML); the desktop app has a **tray icon, reminders** and can start with the computer.

**Starter features:** wiki, knowledge, gallery, files, scripts, skills, mcp, chat, tasks, calendar, team, map, diagrams, contacts, devices, issue (GitHub or Forgejo issues; older projects may say `github`); ticketsystem (GLPI 11); comfyui; version-control. Deleted ones come back with *Features → Restore built-in features*. You can add your own under *Features → New feature*, by copying a YAML file, or by asking Claude.

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
- **MCPs for programs:** Blender, Unity, Unreal Engine, Godot, OpenSCAD and FreeCAD — tick them under *Manage → MCP* (or `programs: [blender]` in `project.yaml`); what Claude makes with them is saved in the project ([MCP](https://github.com/GFGMNET/Workspace/wiki/MCP)).
- **LM Studio:** the chat can also use a local model (`chat: { engine: lmstudio }`) — [Chat](https://github.com/GFGMNET/Workspace/wiki/Feature-Chat).
- **Workspace MCP server:** lets Claude list, create and edit projects from anywhere. The program is its own MCP server; the home page shows the exact command for your folder, e.g.:
  ```
  claude mcp add project-workspace --scope user -- "C:\path\to\Workspace.exe" mcp
  ```

## More

- **New here?** [Getting started](docs/GETTING-STARTED.md) · [Wiki](https://github.com/GFGMNET/Workspace/wiki) · [What's new in each version](https://github.com/GFGMNET/Workspace/releases)
- Full design: [docs/DESIGN.md](docs/DESIGN.md) · the Rust rebuild: [docs/MIGRATION-RUST.md](docs/MIGRATION-RUST.md)
- Requirements and their status: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- Security, reporting a vulnerability: [SECURITY.md](SECURITY.md) · [Code signing policy](CODE-SIGNING-POLICY.md)
- Bugs: first [Known bugs](https://github.com/GFGMNET/Workspace/wiki/Known-bugs) / [Known hiccups](https://github.com/GFGMNET/Workspace/wiki/Known-hiccups), then [Issues](https://github.com/GFGMNET/Workspace/issues) · Ideas: **[vote for features](https://github.com/GFGMNET/Workspace/wiki/Vote-for-features)** (👍 / 👎) or the form [New idea](https://github.com/GFGMNET/Workspace/issues/new?template=new-idea.yml) · Security problems: privately (Security tab → Report a vulnerability) · [Known security issues](https://github.com/GFGMNET/Workspace/wiki/Known-security-issues)
- Tests: `npm test` (unit checks), `npm run test:contract` (API contract, run against the Rust version), `npm run test:yaml`
- Settings (environment variables): `PORT` (default 4321), `CLAUDE_COMMAND` (default `claude`), `VSCODE_COMMAND`

Bundled for offline use: Mermaid (MIT) for diagrams and highlight.js (BSD-3-Clause) for syntax colours in `app/public/vendor/`.
