# Beta of 1.0 (Rust)

Version 1.0 is the same app, rebuilt in Rust. Its name is now simply **Workspace**. It uses your system's browser engine (WebView2 on Windows, WebKitGTK on Linux), so the download is small (about 6 MB) and far fewer security updates are needed. The screens, the data folder and all files stay the same.

The current beta is **0.9.1**, the first **signed** one (earlier: 0.9.0, 0.9.0.5, 0.9.0.6). It is a *pre-release* on the [Releases page](https://github.com/GFGMNET/Workspace/releases): installed 0.x apps never get it by themselves.

## Try it
1. Make a **copy of your data folder**.
2. Download the zip for your computer: `windows-x64` (Windows 11) or `linux-x64`.
3. Unzip it into a **new** folder and put the copy of your data folder next to the program, named `data`.
4. Start `Workspace.exe` (Windows) or `workspace` (Linux).

Check what you use every day: projects, records, pictures, the chat with Claude, the VS Code tab, the tray and reminders, start with the computer.

## Good to know
- Version 1.0 runs on **Windows 11** and **Linux (x64)**. Windows 10, ARM computers (e.g. Raspberry Pi) and macOS are not supported.
- 0.9.1 is **signed** with the project's own certificate "Workspace". Windows warns until you trust the certificate once: [[Signing certificate|Signing-certificate]]. Updates are only installed when they carry exactly this signature. (0.9.0–0.9.0.6 were not signed.)
- Linux needs WebKitGTK 4.1 for the window (most desktops have it). `workspace-server` runs without a window.
- Secrets: on Windows they are taken over from 0.x; on Linux enter them again once.
- A reminder can't be clicked; the tray menu lists what is due — click an entry to open it.
- The X closes the app (it doesn't hide in the tray like 0.x).
- Quit a running 0.x app first (tray → Quit).

Problems? Open an issue with the label `v1.0`.
