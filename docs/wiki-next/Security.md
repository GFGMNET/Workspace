# Security

## What protects you

- **Only on your computer:** the workspace listens on `127.0.0.1`, so other computers on the network can't reach it. Requests from other websites in your browser are refused.
- **Files stay inside the workspace:** the explorer and the app can't read or write outside the data folder and the projects' folders. App-private files (secrets, the VS Code token) can't be opened at all.
- **Secrets are encrypted** and, in the desktop app, protected by Windows for your user. See [[Secrets]].
- **The desktop app's window** only shows your local workspace. Other links open in your normal browser.
- **Signed program and updates:** the Windows program is signed with the project's own certificate; an update is only installed when it carries exactly this signature and is unchanged (Linux: it must match the release's checksum list). See [[Signing certificate|Signing-certificate]].

## Security updates

- **The browser engine** is your system's: WebView2 on Windows 11 is kept up to date by Windows itself, WebKitGTK on Linux by your distribution's updates.
- **The program's own libraries** (Rust) are checked on every change and every Monday; known vulnerabilities stop the build until they are fixed.
- The app finds new releases with its weekly update check. Click **Update now** to install.

**Keep the app up to date.** Only the latest release gets security fixes.

## Report a problem

Found a vulnerability? Please don't open a public issue. Use **Security → Report a vulnerability** on the [GitHub repository](https://github.com/GFGMNET/Workspace/security).
