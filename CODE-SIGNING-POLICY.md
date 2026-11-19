# Code signing policy

The Windows programs are signed with the project's **own certificate** "Workspace" (self-made, not bought). It is stored in
[`signing/`](signing/) in this repository (decided by the maintainer). How to trust it: [wiki: Signing certificate](https://github.com/GFGMNET/Workspace/wiki/Signing-certificate).

## What is signed

From version 0.9.1 (the version 1.0 line, *Workspace*): `Workspace.exe` and `workspace-server.exe` in the Windows package
`workspace-vX.Y.Z-windows-x64.zip` on the [Releases page](https://github.com/GFGMNET/Workspace/releases).
They are built by GitHub Actions (`.github/workflows/build-rust.yml`) from the source code in this repository, and nothing else
is signed. A release is only started by the maintainer. Versions 0.x are not signed.

## Team

| Role | Members |
|---|---|
| Committers and reviewers (may change the source code; review changes from others) | [GFGMNET](https://github.com/GFGMNET) |
| Release (starts the signed build) | [GFGMNET](https://github.com/GFGMNET) |

Changes from other people come in as pull requests and are reviewed before they are merged.
All team members use multi-factor authentication for GitHub.

## Privacy

This program does not send any information to other computers unless the user asks for it. In detail:
- **Update check:** once a week it asks GitHub (`api.github.com`) whether there is a newer release. No data about you or your
  projects is sent. Turn it off in `data/settings.yaml` with `updates: { check: false }`.
- **Features you use:** the *GitHub issues* feature reads the issues of the repository you name from GitHub; the *VS Code* tab
  starts VS Code's own web server, which Microsoft's VS Code may download the first time; the *Chat* runs Claude CLI, a separate
  program by Anthropic with its own [privacy policy](https://www.anthropic.com/legal/privacy).
- Everything else stays on your computer: the app only listens on `127.0.0.1`.

Third-party privacy policies: [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement),
[Microsoft (VS Code)](https://privacy.microsoft.com/privacystatement), [Anthropic (Claude CLI)](https://www.anthropic.com/legal/privacy).
