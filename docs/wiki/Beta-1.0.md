# Beta of 1.0 (Rust)

Version 1.0 is the same app, rebuilt in Rust. It uses your system's browser engine (WebView2 on Windows, WebKitGTK on Linux), so the download is small (about 6 MB) and far fewer security updates are needed. The screens, the data folder and all files stay the same.

The beta is **0.9.0**. It is a *pre-release* on the [Releases page](https://github.com/GFGMNET/Workspace/releases): installed 0.x apps never get it by themselves.

## Try it
1. Make a **copy of your data folder**.
2. Download the zip for your computer: `windows-x64`, `linux-x64` or `linux-arm64`.
3. Unzip it into a **new** folder and put the copy of your data folder next to the program, named `data`.
4. Start `ProjectWorkspace.exe` (Windows) or `project-workspace` (Linux).

Check what you use every day: projects, records, pictures, the chat with Claude, the VS Code tab, the tray and reminders, start with the computer.

## Good to know
- 0.9.0 is **not signed**: Windows SmartScreen warns. Choose *More info → Run anyway*. 0.9.1 will be signed.
- Linux needs WebKitGTK 4.1 for the window (most desktops have it). `project-workspace-server` runs without a window.
- Secrets: on Windows they are taken over from 0.x; on Linux enter them again once.
- Clicking a reminder does not open the item yet.

Problems? Open an issue with the label `v1.0`.
