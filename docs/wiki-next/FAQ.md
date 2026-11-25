# FAQ

> **Use at your own risk.** Workspace is free software, provided "as is" without any warranty (MIT License).
>
> **You are responsible for your data and its backups** — not the app and not its maintainer. Back up your `data` folder regularly and before every update: [[Backup]].

## Basics

### What do I need to run Workspace?
Supported:
- **Windows 11**, 64-bit (x64). Nothing else to install — the window engine (WebView2) is part of Windows 11.
- **Linux**, 64-bit (x64): **Ubuntu 24.04** or newer, **Linux Mint 22** or newer, **Debian 13** or newer, **Fedora 40** or newer
  — and Linux that is always kept up to date, like **Arch Linux**, **Manjaro**, **EndeavourOS** or **openSUSE Tumbleweed**
  (any Linux with glibc 2.39 or newer works). For the window: WebKitGTK 4.1 (most desktops have it).

Not supported:
- Windows 10 and older
- macOS
- ARM computers (e.g. Raspberry Pi, Windows on ARM)
- Older Linux, e.g. Ubuntu 22.04, Linux Mint 21, Debian 12 — Workspace does not start there, also not `workspace-server`

Optional: internet and the Claude CLI for the chat; VS Code for the VS Code tab.

### Do I need a database or a server?
No. The program runs a small local app on your PC (`localhost`), and everything is files in `data/`.

### Can several people use it?
Each person runs it on their own PC. You can share the `data` folder (OneDrive, a network drive), but two people editing the same file at the same moment can overwrite each other.

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

## Chat & VS Code

### The chat says "Claude CLI not found"
Install Claude CLI and run `claude` once in a terminal to sign in. If it's installed somewhere unusual, set `CLAUDE_COMMAND` to its full path.

### The VS Code button does nothing
The `code` command isn't on the PATH. Reinstall VS Code with *Add to PATH*, or set `VSCODE_COMMAND`.

### The VS Code tab stays blank
VS Code needs internet the first time it starts (it downloads its web part once). If it says *VS Code is not installed*, install it from the link shown.

## Files & YAML

### Which YAML can I use?
Full YAML 1.2: anchors and aliases (`&name` / `*name`), merge keys (`<<: *name`), block text (`|`, `>`), flow lists `[a, b]`, comments, and several documents separated by `---`. Dates like `2026-11-18` and words like `yes` stay text. A file with an indentation mistake still opens, but shows a warning: fix it so it's standard YAML.

### My `project.yaml` won't save
It has a YAML error; the message names the line. A common cause is indentation: list items need a `-` and the same number of spaces.


## Your data

### Who is responsible for my data?
You are — not the app and not its maintainer. Everything is in your `data` folder: back it up regularly and before every update. How: [[Backup]].

### I deleted something by mistake
Look in `.trash` inside the project folder. Nothing is really deleted by the app.

## Help & feedback

### Where do I report a bug?
First look at [[Known bugs|Known-bugs]] and [[Known hiccups|Known-hiccups]] — maybe it is already known. If not, open an [issue on GitHub](https://github.com/GFGMNET/Workspace/issues/new): what you did, what happened, Windows 11 or Linux.

### Is it a bug or a hiccup?
The maintainer decides. Bugs are fixed in a version ([[Known bugs|Known-bugs]]); hiccups are small problems that are not bugs, e.g. something that goes away after a restart ([[Known hiccups|Known-hiccups]]).

### Where do I suggest a feature?
Look at [[Vote for features|Vote-for-features]] and vote 👍 / 👎. Something new? Use the form [New idea](https://github.com/GFGMNET/Workspace/issues/new?template=new-idea.yml).

### I found a security problem
Please report it **privately**: on GitHub open the **Security** tab of the project → **Report a vulnerability** — not as a normal issue. Known ones: [[Known security issues|Known-security-issues]].
