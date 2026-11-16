# Security

## Supported versions

Only the **latest release** gets security fixes. Installed apps check for a new version once a week and offer the update (see the wiki, *Data and Updates*).

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting instead: **Security → Report a vulnerability** in this repository. Describe what is affected, how to reproduce it, and which version you use. You get an answer within a week.

## How the app is kept secure

- **Small attack surface:** the app only listens on the computer itself (`127.0.0.1`), checks the address and origin of every request (no DNS rebinding, no requests from other websites), and keeps file access inside the workspace.
- **No npm packages at runtime:** three bundled libraries (yaml, Mermaid, highlight.js, see `tools/vendor.json`), checked every week for new versions and known vulnerabilities.
- **Signed updates:** every release is signed with a key that only exists on the maintainer's PC (not on GitHub). The app installs an update only if its signature is valid and the download matches the signed checksum.
- **Browser engine:** the desktop app ships Electron. A weekly check builds a patch release when Electron publishes a security update (signed and published by the maintainer), and opens an issue before an Electron version reaches its end of life.
- **Code scanning:** CodeQL scans the code on every change; Dependabot keeps the build workflows up to date.
- **Secrets** (API keys, passwords) are stored encrypted and protected by the operating system in the desktop app.

Details: [docs/DESIGN.md](docs/DESIGN.md), section *Security*.
