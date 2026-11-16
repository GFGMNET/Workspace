# Security

## What protects you

- **Only on your computer:** the workspace listens on `127.0.0.1`, so other computers on the network can't reach it. Requests from other websites in your browser are refused.
- **Files stay inside the workspace:** the explorer and the app can't read or write outside the data folder and the projects' folders. App-private files (secrets, the VS Code token) can't be opened at all.
- **Secrets are encrypted** and, in the desktop app, protected by Windows for your user. See [[Secrets]].
- **The desktop app's window** only shows your local workspace, with Chromium's sandbox and context isolation. Other links open in your normal browser.

## Security updates

Most security fixes concern the **browser engine** (Chromium) and **Node.js** inside the desktop app (Electron):

- Every Monday, GitHub checks for a new Electron security update. If there is one, a **patch release** (e.g. 0.6.3) is built automatically and waits for the maintainer's signature.
- **Every release is signed** on the maintainer's own PC; the signing key is never on GitHub. The app only installs updates with a valid signature, so even someone who took over the GitHub account couldn't push a fake update to you.
- The app finds new releases with its weekly update check. Click **Update now** to install.

The bundled libraries (yaml, Mermaid, highlight.js) are checked every week too; known vulnerabilities open an issue right away.

**Keep the app up to date.** Only the latest release gets security fixes.

**With Node.js** (start.bat / start.sh) your installed Node.js and browser are used; keep those up to date yourself.

## Report a problem

Found a vulnerability? Please don't open a public issue. Use **Security → Report a vulnerability** on the [GitHub repository](https://github.com/GFGMNET/Workspace/security).

## Coming: version 1.0

A rewrite of the core in **Rust** with **Tauri** is planned. It uses the browser engine Windows already has and keeps up to date (WebView2), so the app no longer ships its own. See the [[Design]] page, *Version 1.0*.
