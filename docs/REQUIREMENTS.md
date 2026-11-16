# Requirements

This is every requirement for Project Workspace, in the order it was raised. It is kept up to date whenever a requirement is added, changed or done. The details live in the linked GitHub issues, and the design in [DESIGN.md](DESIGN.md).

**Status:** ✅ done · 🚧 in progress · 📋 planned · ❓ to decide · ❌ dropped

## Core

| ID | Requirement | Status | Issue |
|---|---|---|---|
| R1 | A workspace to manage many projects: create projects and view them | ✅ v0.1 | |
| R2 | Projects can be very different: each project page is built from a YAML file (`project.yaml`) | ✅ v0.1 | |
| R3 | `project.yaml` says *which* features a project has; the workspace root says *what* each feature means (`features/*.yaml`) | ✅ v0.1 | |
| R4 | New feature types can be added later without code (YAML), in the app, by hand or by Claude | ✅ v0.1 | |
| R5 | No database: pure files, easy to copy and move | ✅ v0.1 | |
| R6 | Graphical interface | ✅ v0.1 | |
| R7 | Dark mode (light / dark / follow Windows) | ✅ v0.1 | |
| R9 | UI follows the accepted mockup | ✅ accepted 2026-11-16 | #2 |
| R8 | The original example YAML works as written (incl. typos `knowlege`, `skils` and shifted indentation) | ✅ (read leniently, with a warning) | #8 |
| R10 | Full YAML support (anchors, aliases, merge keys, several documents, …) | ✅ | #12 |

## Building blocks (feature types)

| ID | Requirement | Status | Issue |
|---|---|---|---|
| B1 | Wiki: Markdown pages with search | ✅ v0.1 | |
| B2 | Knowledge base | ✅ v0.1 | |
| B3 | Picture gallery | ✅ v0.1 | |
| B4 | Gallery sorting: by date (photo date), name, size; group by album, month, year | ✅ | #16 |
| B5 | Skills: `SKILL.md` files for agents | ✅ v0.1 | |
| B6 | MCP connections | ✅ v0.1 | |
| B7 | Kanban board | ✅ v0.1 | |
| B8 | Diagrams, written as Mermaid text | ✅ v0.1 | |
| B9 | Org chart | ✅ v0.1 | |
| B10 | Map: offline image with pins | ✅ v0.1 | |
| B11 | Calendar | ✅ v0.1 | |
| B12 | Chat window that uses Claude CLI | ✅ v0.1 · real-CLI test open | #9 |
| B13 | Chat permissions defined per project | ✅ v0.1 | |
| B14 | Tables, lists, cards for records; files | ✅ v0.1 | |
| B15 | Scripts: create scripts inside a project with a code editor | ✅ | #23 |
| B16 | GitHub issues of a repository as a feature | ✅ | #28 |
| B17 | Ticketsystem: GLPI tickets of a project (osTicket dropped: create-only API) (plan: [plans/TICKETSYSTEM.md](plans/TICKETSYSTEM.md)) | 📋 v1.1 (Rust) | #59 |

## Working with projects

| ID | Requirement | Status | Issue |
|---|---|---|---|
| W1 | Project overview page (counts, coming up, open tasks, recent changes) | ✅ | #18 |
| W2 | Paste and drop pictures into wiki pages | ✅ | #20 |
| W3 | Links between features + "mentioned in" | ✅ | #19 |
| W4 | Explorer to view all files of the projects (and the whole workspace) | ✅ | #22 |
| W5 | Open projects and files in VS Code | ✅ | #21 |
| W6 | Full VS Code inside the app (browser VS Code via `code serve-web`, or code-server / OpenVSCode Server) | ✅ | #24 |
| W6b | VS Code tab: focused layout with just explorer and editor | 📋 | #62 |
| W6a | VS Code tab must work without changing browser settings (served through the app's own address) | ✅ checked on a runner (Chromium + Electron) · to re-test on Windows | #30, #33, #34, #57 |
| W7 | Collapsible left sidebar | ✅ | #15 |
| W8 | Rename and archive projects in the app; delete = delete the project folder | ✅ | #11 |
| W9 | Answer chat permission prompts inline | 📋 | #10 |
| W10 | Version history with git inside the app | ❌ not wanted: git is only for developing the tool | |
| W11 | A project can live in an existing folder (`location:`), e.g. a git clone | ✅ | #27 |
| W12 | Manage this workspace itself as a project (example *Workspace (development)*) | ✅ | #29 |
| W13 | Secrets: API keys and passwords kept encrypted, used by name (`${secret:name}`) | ✅ | #38 |
| W14 | Project templates: save a project (with or without content), start new projects from it | ✅ | #39 |
| W15 | Everything due in all projects on the home page; reminders, tray icon, start with Windows (desktop app) | ✅ | #40 |
| W16 | Backup of the data folder | ❌ not built: documented in the wiki (*Backup*) | |
| W18 | Versions: Git or SVN per project, local, on a share or an own server (set by IP address and port), no GitHub needed (plan: [plans/VERSION-CONTROL.md](plans/VERSION-CONTROL.md)) | 📋 v1.2 (Rust) | #60 |
| W17 | Import / export | ❌ not built: files are copied in and out, documented in the wiki (*Import and Export*) | |

## Delivery and operations

| ID | Requirement | Status | Issue |
|---|---|---|---|
| D1 | Connect via Claude CLI and different MCP servers | ✅ v0.1 | |
| D2 | Runs like a real application, nothing to install (portable `ProjectWorkspace.exe`, desktop app since v0.6) | ✅ built · to test on Windows | #1 |
| D3 | The .exe is built automatically by GitHub (workflow *Build Windows app*, by hand or with every release) | ✅ | #1 |
| D4 | The git repository is only for developing the tool; live installations never use git and update by downloading a new version | ✅ | #17 |
| D5 | Client data is kept separate from the program, so updates never overwrite it | ✅ | #17 |
| D6 | `start.bat` must not open the browser before the app is ready | ✅ | #14 |
| D7 | Track improvements and bugs as GitHub issues | ✅ ongoing | |
| D8 | The design document lives in the repo so anyone can rebuild the tool | ✅ | [DESIGN.md](DESIGN.md) |
| D9 | Requirements tracked in this file | ✅ ongoing | |
| D10 | Licence for the repository: MIT | ✅ | #13 |
| D11 | Getting started guide | ✅ | #25 · [GETTING-STARTED.md](GETTING-STARTED.md) |
| D12 | Wiki on the GitHub page (generated from `docs/`, published by a GitHub Action) | ✅ · first page must be created once on GitHub | #25 |
| D13 | The app checks GitHub once a week for a new version and asks the user to update (release notes, *Update now / Later / Skip*) | ✅ | #26 |
| D14 | New versions are published as GitHub releases by a GitHub Action when a version tag is pushed | ✅ | #26 |
| D15 | Wiki: a details page per feature with all its options | ✅ | |
| D16 | Link to the wiki inside the app (sidebar, Help on every feature) | ✅ | |
| D17 | Linux variant in every release (x64 and arm64, nothing to install) | ✅ | #32 |
| D18 | The app restarts by itself after an update | ✅ | #35 |
| D19 | Desktop app in its own window instead of the browser (Electron, Windows and Linux) | ✅ v0.6.0 · to test on Windows | #36 |
| D20 | Security: weekly check of Electron and bundled libraries, automatic security releases, CodeQL, Dependabot, SECURITY.md | ✅ | |
| D21 | Version 1.0: core in Rust with Tauri, no bundled browser engine (fewer CVEs) — plan: [MIGRATION-RUST.md](MIGRATION-RUST.md) | 📋 planned | #41, #49–#55 |
| D22 | Trusted releases: account protection, free code signing (SignPath Foundation) with 1.0, updater checks (plan: [plans/RELEASE-TRUST.md](plans/RELEASE-TRUST.md)) | ❓ proposed | #49, #31 |

## Open questions

