# FAQ

**Do I need a database or a server?**
No. Node.js runs a small local app on your PC (`localhost`), and everything is files in `data/`.

**Can several people use it?**
Each person runs it on their own PC. You can share the `data` folder (OneDrive, a network drive), but two people editing the same file at the same moment can overwrite each other.

**Does it need internet?**
No, except for the Claude chat, the first start of the in-app VS Code, MCP servers that are online, and the weekly update check (which simply fails quietly when offline).

**How do I get new versions?**
The app tells you: once a week it checks GitHub and shows *Version X is available* with an **Update now** button. See [[Data and Updates|Data-and-Updates]].

**Windows says "Windows protected your PC" when I start the exe**
The exe isn't code-signed yet, so SmartScreen doesn't know the publisher. Click **More info → Run anyway**; Windows remembers it. Signing is planned ([#31](https://github.com/GFGMNET/Workspace/issues/31)).

**Does it run on Linux?**
Yes. Download `project-workspace-…-linux-x64.zip` (or `-linux-arm64.zip` for ARM, e.g. a Raspberry Pi), unzip it, and run `./project-workspace`. On a server without a desktop, run `./project-workspace-server` instead (no window).

The app only listens on the machine itself (`127.0.0.1`). To reach it from another computer, use an SSH tunnel (`ssh -L 4321:localhost:4321 server`) rather than opening it to the network.

**Why does it open in its own window and not in my browser?**
Since v0.6 the downloads are a desktop app (Electron). It brings its own browser engine, so it works the same everywhere, including the VS Code tab. To use your browser instead, choose **Workspace → Open in browser** in the menu (press Alt if the menu is hidden), or start it with `--browser`. While the app runs, any browser on the same computer can open http://localhost:4321 too.

**Updating from v0.5 to v0.6 on Linux**
v0.5 can't keep the file permissions Electron needs when it updates itself. Download the v0.6 zip once, unzip it, and move your `data` folder into it. Later updates work in the app again.

**Do I need start.bat?**
Not with the Windows app: **ProjectWorkspace.exe** replaces it. `start.bat` / `start.sh` are for running the program with Node.js, e.g. from a git clone while developing, or on macOS and Linux.

**"Port 4321 is already in use"**
The workspace is already running. Open http://localhost:4321, or start a second one with `node app/server.js 4322`.

**The chat says "Claude CLI not found"**
Install Claude CLI and run `claude` once in a terminal to sign in. If it's installed somewhere unusual, set `CLAUDE_COMMAND` to its full path.

**The VS Code button does nothing**
The `code` command isn't on the PATH. Reinstall VS Code with *Add to PATH*, or set `VSCODE_COMMAND`.

**The VS Code tab stays blank**
Some browsers block embedded pages. Use **Open in new window**.

**Which YAML can I use?**
Full YAML 1.2: anchors and aliases (`&name` / `*name`), merge keys (`<<: *name`), block text (`|`, `>`), flow lists `[a, b]`, comments, and several documents separated by `---`. Dates like `2026-11-18` and words like `yes` stay text. A file with an indentation mistake still opens, but shows a warning: fix it so it's standard YAML.

**My `project.yaml` won't save**
It has a YAML error; the message names the line. A common cause is indentation: list items need a `-` and the same number of spaces.

**I deleted something by mistake**
Look in `.trash` inside the project folder. Nothing is really deleted by the app.

**Where do I report a bug or suggest a feature?**
At [Issues](https://github.com/GFGMNET/Workspace/issues).
