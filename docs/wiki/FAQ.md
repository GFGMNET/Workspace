# FAQ

> **Use at your own risk.** Workspace is free software, provided "as is" without any warranty (MIT License).
>
> **You are responsible for your data and its backups** — not the app and not its maintainer. Back up your `data` folder regularly and before every update: [[Backup]].

## Basics

### What do I need to run Workspace?
Supported:
- **Windows 11**, 64-bit (x64). Nothing else to install — the window engine (WebView2) is part of Windows 11.
- **Linux**, 64-bit (x64), with glibc **2.39 or newer**. For the window: WebKitGTK 4.1 (most desktops have it). For example:

  | Linux | Works from |
  |---|---|
  | Ubuntu and its flavours (Kubuntu, Xubuntu, Lubuntu, Ubuntu MATE …) | 24.04 |
  | Linux Mint | 22 (LMDE: 7) |
  | Pop!_OS | 24.04 |
  | elementary OS | 8 |
  | Zorin OS | 18 |
  | Debian | 13 |
  | Fedora | 40 |
  | Red Hat Enterprise Linux, Rocky Linux, AlmaLinux | 10 |
  | Arch Linux, Manjaro, EndeavourOS, openSUSE Tumbleweed, Kali (always kept up to date) | current version |

  Not in the list? Open a terminal and type `ldd --version`. If the first line shows **2.39** or a higher number, Workspace works.

Not supported:
- Windows 10 and older
- macOS
- ARM computers (e.g. Raspberry Pi, Windows on ARM)
- Older Linux, e.g. Ubuntu 22.04, Linux Mint 21, Debian 12 — Workspace does not start there, also not `workspace-server`

Optional: internet and the Claude CLI for the chat; VS Code for the VS Code tab.

### Do I need a database or a server?
No. The program runs a small local app on your PC (`localhost`), and everything is files in `data/`.

### Can several people use it? Can we share a folder?
Each person runs Workspace on their own PC. You **can** put the `data` folder on OneDrive or a network drive and share it, but only like this:
- **OK:** one person after the other, or each person in a **different project**.
- **Not OK:** two people in the **same project at the same time**. Whoever saves last wins — the other's changes are lost without a warning. OneDrive may also create conflict copies (e.g. `page-PC-Name.md`) that show up as extra pages.
- **Secrets** work only for the person who entered them. Others can't read them — each person needs their own (and removing them breaks them for the others).
- Window size, tray and autostart settings are shared too, so they overwrite each other.

Real teamwork is not built in. Want it? Vote for it: [Working together in a shared folder](https://github.com/GFGMNET/Workspace/issues/122).

### Does it need internet?
No, except for the Claude chat, the first start of the in-app VS Code, MCP servers that are online, and the weekly update check (which simply fails quietly when offline).

### How do I get new versions?
The app tells you: once a week it checks GitHub and shows *Version X is available* with an **Update now** button. See [[Data and Updates|Data-and-Updates]].

### Does it run on Windows 10?
No. Workspace 1.0 needs **Windows 11** (64-bit). Linux is supported too (see below).

### Does it run on Linux?
Yes (x64). Download `workspace-v…-linux-x64.zip`, unzip it, and run `./workspace`. On a server without a desktop, run `./workspace-server` instead (no window). ARM computers (e.g. a Raspberry Pi) are not supported.

### Can I open it from another computer?
The app only listens on the computer it runs on (`127.0.0.1`), for safety. To reach it from another computer, use an SSH tunnel (`ssh -L 4321:localhost:4321 server`) rather than opening it to the network.

### Why does it open in its own window and not in my browser?
The download is a desktop app that uses your system's browser engine. To use your browser instead, choose **Open in browser** in the tray menu, or start it with `--browser`. While the app runs, any browser on the same computer can open http://localhost:4321 too.

### I still have the old app (0.x)
It is deprecated. See [[Moving to 1.0|Moving-to-1.0]].

## Starting the app

### Windows says "Windows protected your PC" when I start the exe
Workspace is signed with the project's own certificate, which Windows doesn't know yet. Trust it once and the warning is gone: [[Signing certificate|Signing-certificate]]. Or click **More info → Run anyway**.

### The app doesn't start
Go through these in order:
1. Windows says *"Windows protected your PC"*: see [Windows protected your PC](#windows-says-windows-protected-your-pc-when-i-start-the-exe).
2. *"Port 4321 is already in use"*: see [Port 4321 is already in use](#port-4321-is-already-in-use).
3. Linux: the window needs WebKitGTK 4.1. Install it, or start with `./workspace --browser`.
4. No window opens: start it with `--browser` and open http://localhost:4321.
5. Still nothing: report a bug on GitHub and write which system you use (Windows 11 or Linux) and what you see.

### "Port 4321 is already in use"
The workspace is already running. Open http://localhost:4321, or start a second one with a port number: `Workspace.exe 4322` on Windows, `./workspace 4322` on Linux.

### Can I use another port than 4321?
Yes. Start it with a port number: `Workspace.exe 4322` (Windows) or `./workspace 4322` (Linux). Then open http://localhost:4322 in a browser if needed.

## Chat

### What do I need for the chat?
One of the two:
- **Claude** (default): [Claude CLI](https://docs.claude.com/en/docs/claude-code), installed and signed in once (type `claude` in a terminal), and an internet connection. The chat shows the Claude CLI version, or *Claude CLI not found*.
- **LM Studio** (a model on your own PC or in your network): only [LM Studio](https://lmstudio.ai) with a loaded model — no Claude CLI, no internet. See the questions about LM Studio below.

### The chat says "Claude CLI not found"
Install Claude CLI and run `claude` once in a terminal to sign in. If it's installed somewhere unusual, set `CLAUDE_COMMAND` to its full path.

### Can Claude change my files?
That is set per project, with `permissions:` under `chat:` in `project.yaml`:
- `ask` (default): Claude asks first — **Allow** · **Always allow in this chat** · **Don't allow**
- `auto`: Claude may change files directly
- `read-only`: Claude only reads

Tip: `auto` for a scratch project, `read-only` for client data. More: [[Chat|Feature-Chat]].

### Where are my chats saved, and can I continue them?
In the project, in the folder `chats/` — one file per conversation. Open an old chat and write on: Claude continues where it stopped.

### Can I leave the chat while Claude is answering? How do I stop it?
Yes. Go to another page: Claude keeps working. Come back to the chat to see the answer so far and any question it is waiting for. **Stop** stops Claude.

### Can I choose the Claude model?
Yes, with `model:` under `chat:`, e.g. `model: sonnet`. Without it, the Claude CLI default is used.

### Can Claude manage the whole workspace (create projects and so on)?
Yes. Register the workspace once in a terminal:
`claude mcp add project-workspace --scope user -- "C:\Workspace\Workspace.exe" mcp`
(Linux: `-- /path/to/workspace-server mcp`). Then you can ask Claude e.g. *"create a project Office Move with a wiki, tasks and contacts"*. More: [[Claude]].

### Can I use a local model with LM Studio instead of Claude?
Yes. In the project's `project.yaml`:

```yaml
chat:
  engine: lmstudio                # claude (default) or lmstudio
  url: http://127.0.0.1:1234      # where LM Studio runs
  model: qwen/qwen3-coder-30b     # the model in LM Studio
  permissions: ask                # as with Claude
```

The model can read, create, change and delete files and run commands in the project, with the same `permissions:` as Claude. Skills and MCP connections work only with Claude for now.

### Which LM Studio model should I use?
One with **tool support** (the hammer symbol in LM Studio), e.g. a Qwen Coder model. Small models sometimes don't use the tools and just answer with text. On a weak PC, answers can be slow.

### The chat says LM Studio can't be reached or the model isn't loaded
1. Start LM Studio and turn on its server (Developer → Start server).
2. Load the model named in `model:`.
3. Check `url:` — the default is `http://127.0.0.1:1234`.

### Can I use LM Studio on another computer in my network?
Yes: put that computer's address in `url:` (e.g. `http://192.168.1.20:1234`). LM Studio has **no password** — do this only in your own network.

## VS Code

### Do I need VS Code installed?
Yes — for the **Open in VS Code** button and for the **VS Code tab**. Download: https://code.visualstudio.com

### What is the difference between "Open in VS Code" and the VS Code tab?
**Open in VS Code** (gear icon → Manage) opens the project in your normal VS Code window. The **VS Code tab** shows VS Code inside the app, opened on the project — with extensions, terminal and Git.

### The VS Code button does nothing
The `code` command isn't on the PATH. Reinstall VS Code with *Add to PATH*, or set `VSCODE_COMMAND`.

### The VS Code tab stays blank
VS Code needs internet the first time it starts (it downloads its web part once). If it says *VS Code is not installed*, install it from the link shown.

### The VS Code tab is slow the first time
The first start downloads VS Code's web part once (needs internet, about 10–40 seconds). After that it starts in a few seconds.

### "VS Code did not start" or a black window
1. Wait a moment — the tab says *VS Code is starting…* while it starts.
2. Switch to another tab and back to the VS Code tab.
3. Still nothing: close Workspace completely (tray → Quit) and start it again.
4. Another program may use port 8740. Close it, or change the port in `data/settings.yaml` (`ide:` → `port:`).
5. Still not working: report a bug ([[Known bugs|Known-bugs]] first).

### Can others reach my VS Code tab?
No. VS Code runs only on your own computer (`127.0.0.1`) with a secret access token, and the app shows it through its own address. Other computers and other websites can't reach it.

### Can I use code-server instead of VS Code?
Yes, or OpenVSCode Server. Change `ide:` in `data/settings.yaml` — the example is on [[VS Code and Explorer|VS-Code-and-Explorer]].

## Files & YAML

### Which YAML can I use?
Full YAML 1.2: anchors and aliases (`&name` / `*name`), merge keys (`<<: *name`), block text (`|`, `>`), flow lists `[a, b]`, comments, and several documents separated by `---`. Dates like `2026-11-18` and words like `yes` stay text. A file with an indentation mistake still opens, but shows a warning: fix it so it's standard YAML.

### My `project.yaml` won't save
It has a YAML error; the message names the line. A common cause is indentation: list items need a `-` and the same number of spaces.


### Can I put a project on Git?
Yes. A project is a normal folder (`data/projects/<name>/`). Open the project's **VS Code tab** (Source Control on the left) or a terminal in the project folder, set up Git, commit and push. Only one project folder — never the whole `data` folder.

Your secrets are never in the project folder (only placeholders like `${PW_SECRET_…}`). But leave out your chats and deleted items: save this as `.gitignore` in the project folder:

```gitignore
# Workspace project — what should not go to Git
chats/                        # your Claude conversations
.trash/                       # deleted items
.version-control/             # local Git copy of the Version Control tab
.claude/settings.local.json   # personal Claude CLI settings
# system junk
Thumbs.db
desktop.ini
.DS_Store
```

Want this file in every new project automatically? [Vote for it](https://github.com/GFGMNET/Workspace/issues/124).

## Your data

### Where is my data folder?
Next to the program: the folder `data` next to `Workspace.exe` (Windows) or `workspace` (Linux). Everything that is yours is in there.

### Who is responsible for my data?
You are — not the app and not its maintainer. Everything is in your `data` folder: back it up regularly and before every update. How: [[Backup]].

### I deleted something by mistake
Look in `.trash` inside the project folder. Nothing is really deleted by the app.

### How do I move Workspace to another PC?
1. Back up and copy your `data` folder ([[Backup]]).
2. On the new PC, download Workspace, unzip it and put your `data` folder next to the program.
3. Start it. **Secrets** can't be read on another PC: under **Secrets** click *Remove all secrets* and enter them again.

### How do I uninstall Workspace?
1. Back up your `data` folder if you want to keep it.
2. If you turned on **Start with Windows** in the tray menu, turn it off.
3. Quit Workspace (tray → Quit) and delete its folder. Nothing else is installed on your PC.

## Help & feedback

### Where do I report a bug?
First look at [[Known bugs|Known-bugs]] and [[Known hiccups|Known-hiccups]] — maybe it is already known. If not, open an [issue on GitHub](https://github.com/GFGMNET/Workspace/issues/new): what you did, what happened, Windows 11 or Linux.

### Is it a bug or a hiccup?
The maintainer decides. Bugs are fixed in a version ([[Known bugs|Known-bugs]]); hiccups are small problems that are not bugs, e.g. something that goes away after a restart ([[Known hiccups|Known-hiccups]]).

### Where do I suggest a feature?
Look at [[Vote for features|Vote-for-features]] and vote 👍 / 👎. Something new? Use the form [New idea](https://github.com/GFGMNET/Workspace/issues/new?template=new-idea.yml).

### I found a security problem
Please report it **privately**: on GitHub open the **Security** tab of the project → **Report a vulnerability** — not as a normal issue. Known ones: [[Known security issues|Known-security-issues]].
