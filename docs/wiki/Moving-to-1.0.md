# Moving to 1.0

Version 1.0 is the same app, rebuilt in Rust. Its name is now simply **Workspace**. It uses your system's browser engine (WebView2 on Windows, WebKitGTK on Linux), so the download is small (about 6 MB) and far fewer security updates are needed. The screens, the data folder and all files stay the same.

## From 0.x (the old desktop app)

Version **0.6.3** offers 1.0 like any update: **Update now** in the bar at the top. It
1. checks that the download is the real one (Windows: our signature "Workspace", Linux: the checksum),
2. keeps your `data` folder as it is,
3. starts 1.0 instead of 0.x.

Older 0.x versions first update to 0.6.3, then to 1.0. Or do it by hand: download the 1.0 zip from the [releases page](https://github.com/GFGMNET/Workspace/releases), unzip it into a new folder, move your `data` folder next to `Workspace.exe`, start it.

## Good to know
- Version 1.0 runs on **Windows 11** and **Linux (x64)**. Windows 10, ARM computers (e.g. Raspberry Pi) and macOS are not supported.
- The program is **signed** with the project's own certificate "Workspace". Windows warns until you trust the certificate once: [[Signing certificate|Signing-certificate]].
- Linux needs glibc 2.39 or newer (e.g. Ubuntu 24.04, Mint 22, Debian 13, Fedora 40, up-to-date Arch — full list in the FAQ), and WebKitGTK 4.1 for the window (most desktops have it). Older Linux (e.g. Ubuntu 22.04, Debian 12) is not supported. `workspace-server` runs without a window.
- Secrets: on Windows they are taken over from 0.x; on Linux enter them again once.
- A reminder can't be clicked; the tray menu lists what is due — click an entry to open it.
- The X closes the app (it doesn't hide in the tray like 0.x).
- The old app (0.x, Electron) is **deprecated**: it gets no more updates.

Problems? Open an issue with the label `bug`.
