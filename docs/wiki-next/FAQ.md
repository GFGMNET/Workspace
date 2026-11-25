# FAQ

**Do I need a database or a server?**
No. The program runs a small local app on your PC (`localhost`), and everything is files in `data/`.

**Can several people use it?**
Each person runs it on their own PC. You can share the `data` folder (OneDrive, a network drive), but two people editing the same file at the same moment can overwrite each other.

**Does it need internet?**
No, except for the Claude chat, the first start of the in-app VS Code, MCP servers that are online, and the weekly update check (which simply fails quietly when offline).

**How do I get new versions?**
The app tells you: once a week it checks GitHub and shows *Version X is available* with an **Update now** button. See [[Data and Updates|Data-and-Updates]].

**Windows says "Windows protected your PC" when I start the exe**
Workspace is signed with the project's own certificate, which Windows doesn't know yet. Trust it once and the warning is gone: [[Signing certificate|Signing-certificate]]. Or click **More info → Run anyway**.

**Does it run on Linux?**
Yes (x64). Download `workspace-v…-linux-x64.zip`, unzip it, and run `./workspace`. On a server without a desktop, run `./workspace-server` instead (no window). ARM computers (e.g. a Raspberry Pi) are not supported.

The app only listens on the machine itself (`127.0.0.1`). To reach it from another computer, use an SSH tunnel (`ssh -L 4321:localhost:4321 server`) rather than opening it to the network.

**Why does it open in its own window and not in my browser?**
The download is a desktop app that uses your system's browser engine. To use your browser instead, choose **Open in browser** in the tray menu, or start it with `--browser`. While the app runs, any browser on the same computer can open http://localhost:4321 too.

**I still have the old app (0.x)**
It is deprecated. See [[Moving to 1.0|Moving-to-1.0]].

**The app doesn't start**
Go through these in order:
1. Windows says *"Windows protected your PC"*: see the question above.
2. *"Port 4321 is already in use"*: see the question below.
3. Linux: the window needs WebKitGTK 4.1. Install it, or start with `./workspace --browser`.
4. No window opens: start it with `--browser` and open http://localhost:4321.
5. Still nothing: report a bug on GitHub and write which system you use (Windows 11 or Linux) and what you see.

**"Port 4321 is already in use"**
The workspace is already running. Open http://localhost:4321, or start a second one with a port number: `Workspace.exe 4322`.

**The chat says "Claude CLI not found"**
Install Claude CLI and run `claude` once in a terminal to sign in. If it's installed somewhere unusual, set `CLAUDE_COMMAND` to its full path.

**The VS Code button does nothing**
The `code` command isn't on the PATH. Reinstall VS Code with *Add to PATH*, or set `VSCODE_COMMAND`.

**The VS Code tab stays blank**
VS Code needs internet the first time it starts (it downloads its web part once). If it says *VS Code is not installed*, install it from the link shown.

**Which YAML can I use?**
Full YAML 1.2: anchors and aliases (`&name` / `*name`), merge keys (`<<: *name`), block text (`|`, `>`), flow lists `[a, b]`, comments, and several documents separated by `---`. Dates like `2026-11-18` and words like `yes` stay text. A file with an indentation mistake still opens, but shows a warning: fix it so it's standard YAML.

**My `project.yaml` won't save**
It has a YAML error; the message names the line. A common cause is indentation: list items need a `-` and the same number of spaces.

**I deleted something by mistake**
Look in `.trash` inside the project folder. Nothing is really deleted by the app.

**Where do I report a bug or suggest a feature?**
At [Issues](https://github.com/GFGMNET/Workspace/issues).
