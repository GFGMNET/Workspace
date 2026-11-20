# Getting started

This guide takes about 10 minutes. By the end you'll have the workspace running, your first project with a few features, and Claude and VS Code connected.

## 1. Install

You need:

| What | Why | Where |
|---|---|---|
| **Windows 11** or **Linux (x64)** | runs the workspace | — |
| Claude CLI *(optional)* | the Chat tab and Claude integration | https://docs.claude.com/en/docs/claude-code |
| VS Code *(optional)* | the VS Code tab and buttons | https://code.visualstudio.com |

**Windows 11:** download `workspace-v…-windows-x64.zip` from the [latest release](https://github.com/GFGMNET/Workspace/releases/latest) and unzip it anywhere, for example `C:\Workspace` or a folder in OneDrive. It contains **Workspace.exe**.

**Linux (x64):** download `workspace-v…-linux-x64.zip`, unzip it, and run `./workspace` inside the folder (needs WebKitGTK 4.1, which most desktops have). On a server without a desktop, run `./workspace-server` and open `http://<server>:4321` from a browser on the same machine. For other machines, see the FAQ.

Coming from the old app (0.x)? See [[Moving to 1.0|Moving-to-1.0]].

## 2. Start it

- **Windows:** double-click `Workspace.exe`. The first time, Windows may warn, because it doesn't know the project's own certificate yet: trust it once ([[Signing certificate|Signing-certificate]]) or click **More info → Run anyway**.
- **Linux:** `./workspace`. On a server without a desktop: `./workspace-server`

The app opens in its own window. Closing the window (X) stops the workspace. To use it in a browser instead, choose **Open in browser** in the tray menu, or start the app with `--browser`.

On the first start a `data` folder is created next to the program. **All your projects live there.** It's the only folder you need to back up.

> To look around first, click **Add the example projects** on the home page. You get *test*, *test 2* and *Home Lab*, which uses every building block.

## 3. Create your first project

1. Click **+ New project** in the sidebar.
2. Give it a name and tick the features you want, for example *Wiki*, *Tasks* and *Gallery*. If you saved a template, choose it under **Start from** instead.
3. The right side shows the `project.yaml` that will be written. You can edit it there before you create the project.
4. Click **Create project**.

The project opens on its **Overview**. Every feature you picked is a tab: write a wiki page, add a task to the board, drop some pictures into the gallery.

Everything you do is a normal file in `data/projects/<your project>/`. You can also open that folder in Explorer or VS Code and edit files there; the app updates by itself.

Tasks with a due date and calendar events show up on the home page under **Coming up in all projects**. The desktop app also reminds you of what's due today (tray icon next to the clock). A project you want to reuse: **Manage → Save as template**.

## 4. Understand the two YAML files

**`project.yaml`** says *which* features a project has:

```yaml
name: Home Lab
description: My network at home
wiki:
  - Home            # first page, created for you
tasks:
devices:            # a feature you define yourself (step 5)
chat:
  permissions: ask  # settings just for this project
```

**`data/features/<name>.yaml`** says *what* a feature is, once for all projects:

```yaml
name: Wiki
stores: markdown    # what it stores
layout: pages       # how it looks
search: true
```

Edit a project's YAML in its **project.yaml** tab. Edit the features under **Features** in the sidebar.

## 5. Add your own feature type

Say you want a list of network devices:

1. Go to **Features → + New feature**.
2. Key `devices`, stores **records**, layout **table**.
3. Fields, one per line: `name`, `ip`, `mac`, `location`.
4. Click **Create feature**.

Now add `devices:` to any project, via **+ Feature** in the tab row or in `project.yaml`, and the project gets a sortable, searchable devices table.

The layouts you can use are:
- **Text:** pages, cards, list
- **Records:** table, list, cards, kanban, calendar, org chart, map (your own image with pins)
- **Pictures and files:** picture grid, files, code (scripts)
- **Other:** diagram (Mermaid), chat

## 6. Link things together

- In any page, `[[Router]]` links to the item called *Router* in any feature of the project.
- Records can have **link** fields, for example a task's *Related* field.
- Every page and record shows what is **mentioned in** it.

## 7. Connect Claude

1. Install Claude CLI and run `claude` once in a terminal to sign in.
2. Add the **Chat** feature to a project. Claude then runs inside that project's folder, so it can read and (if allowed) change its files.
3. Choose what Claude may do, per project, in `project.yaml`:

   ```yaml
   chat:
     permissions: ask   # ask before changing files · auto · read-only
   ```
4. The **Skills** feature writes `SKILL.md` files Claude CLI uses automatically. The **MCP** feature writes `.mcp.json` with MCP server connections. Put API keys under **Secrets** in the sidebar and write `${secret:name}` in the connection instead of the key.
5. *Optional:* let Claude manage the whole workspace from any terminal:

   ```
   claude mcp add project-workspace --scope user -- "C:\Workspace\Workspace.exe" mcp
   ```

   The home page shows the exact command for your folder.

## 8. Use VS Code

- **VS Code** button in a project, or **Open in VS Code** on a file: opens it in your installed VS Code.
- **VS Code tab:** the full VS Code inside the app. It starts by itself when you open the tab; the first start downloads its web part once and needs internet that time.
- **Explorer tab:** every file of the project, with a built-in code editor.
- **Scripts feature:** PowerShell, batch, Bash, Python, … with templates.

## 9. Update to a new version

The workspace checks GitHub **once a week**. When a new version is out, a bar at the top says so: click **What's new** to read about it, then **Update now** (or *Later* / *Skip this version*). It downloads the new version, checks that it is really ours (signature / checksum), keeps a backup of the old one in `.update/`, and restarts by itself. Your `data` folder is never touched.

You can also check any time via **v… · Updates** at the bottom of the sidebar.

Updating by hand works too: download the new version and replace everything **except the `data` folder**.

## Something not working?

| Problem | Fix |
|---|---|
| "Port 4321 is already in use" | The workspace is already running: just open http://localhost:4321 |
| Chat says *Claude CLI not found* | Install Claude CLI and sign in once with `claude` in a terminal |
| Chat says to use */login* | Sign in with `claude` in a terminal (`/login`). If you just did, send the message again; if it persists, quit the app (tray → Quit) and start it again |
| VS Code button does nothing | In VS Code run *Shell Command: Install 'code' command in PATH* (macOS), or reinstall VS Code with "Add to PATH" ticked (Windows) |
| VS Code tab stays blank or black | Click **Reload** in the tab, or *Open in new window*. Check that VS Code is installed (`code --version` in a terminal) |
| Windows says *Windows protected your PC* | The app isn't code-signed yet (#31): **More info → Run anyway** |

More help is in the [wiki](https://github.com/GFGMNET/Workspace/wiki), and you can report problems at [Issues](https://github.com/GFGMNET/Workspace/issues).
