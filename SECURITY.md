# Security

## Supported versions

Only the **latest release** gets security fixes. Installed apps check for a new version once a week and offer the update (see the wiki, *Data and Updates*).

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting instead: **Security → Report a vulnerability** in this repository. Describe what is affected, how to reproduce it, and which version you use. You get an answer within a week.

## How the app is kept secure

- **Small attack surface:** the app only listens on the computer itself (`127.0.0.1`), checks the address and origin of every request (no DNS rebinding, no requests from other websites), and keeps file access inside the workspace.
- **No npm packages at runtime:** the app is one Rust program; two bundled JavaScript libraries for the screens (Mermaid, highlight.js, see `tools/vendor.json`) are checked for new versions and known vulnerabilities.
- **Browser engine:** the app uses the system's engine (WebView2 on Windows 11, WebKitGTK on Linux), which Windows Update and the Linux package manager keep current — the app ships no browser engine of its own.
- **Rust libraries:** `cargo-deny` checks them for known vulnerabilities on every change and every week (*Rust security check*). No release while it or CodeQL is not green.
- **Signed releases:** the Windows programs are signed with the project's own certificate ([Signing certificate](https://github.com/GFGMNET/Workspace/wiki/Signing-certificate)); the updater checks that signature (Windows) or the SHA-256 checksum (Linux) before installing.
- **Code scanning:** CodeQL scans the code on every change; Dependabot keeps the build workflows up to date.
- **Secrets** (API keys, passwords) are stored encrypted and protected by the operating system in the desktop app.

Details: [docs/DESIGN.md](docs/DESIGN.md), section *Security*.
