# Security

## Supported versions

Only the **latest release** gets security fixes. Installed apps check for a new version once a week and offer the update (see the wiki, *Data and Updates*).

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting instead: **Security → Report a vulnerability** in this repository. Describe what is affected, how to reproduce it, and which version you use. You get an answer within a week.

## How the app is kept secure

- **Small attack surface:** the app only listens on the computer itself (`127.0.0.1`), checks the address and origin of every request (no DNS rebinding, no requests from other websites), and keeps file access inside the workspace.
- **No npm packages at runtime:** three bundled libraries (yaml, Mermaid, highlight.js, see `tools/vendor.json`), checked every week for new versions and known vulnerabilities.
- **Browser engine:** from version 1.0 (*Workspace*, now in beta) the app uses the system's engine (WebView2 on Windows 11, WebKitGTK on Linux), which Windows Update and the Linux package manager keep current; the Windows program is signed (SignPath Foundation) and the updater checks the signature (Windows) or the checksum (Linux) before installing. Version 0.x ships Electron. A weekly check releases a patch version on its own when Electron publishes a security update, and opens an issue before an Electron version reaches its end of life.
- **Code scanning:** CodeQL scans the code on every change; Dependabot keeps the build workflows up to date.
- **Planned:** signed releases and a code-signed exe, see [docs/plans/RELEASE-TRUST.md](docs/plans/RELEASE-TRUST.md).
- **Secrets** (API keys, passwords) are stored encrypted and protected by the operating system in the desktop app.

Details: [docs/DESIGN.md](docs/DESIGN.md), section *Security*.
