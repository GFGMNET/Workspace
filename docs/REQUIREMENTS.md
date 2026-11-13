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
| R8 | The original example YAML works as written (incl. typos `knowlege`, `skils` and shifted indentation) | ✅ | #8 |

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

## Working with projects

| ID | Requirement | Status | Issue |
|---|---|---|---|
| W1 | Project overview page (counts, coming up, open tasks, recent changes) | ✅ | #18 |
| W2 | Paste and drop pictures into wiki pages | ✅ | #20 |
| W3 | Links between features + "mentioned in" | ✅ | #19 |
| W4 | Explorer to view all files of the projects (and the whole workspace) | ✅ | #22 |
| W5 | Open projects and files in VS Code | ✅ | #21 |
| W6 | Full VS Code inside the app (browser VS Code via `code serve-web`, or code-server / OpenVSCode Server) | ✅ built · Windows test open | #24 |
| W7 | Collapsible left sidebar | ✅ | #15 |
| W8 | Rename, archive and delete projects in the app | 📋 | #11 |
| W9 | Answer chat permission prompts inline | 📋 | #10 |
| W10 | Version history with git inside the app | ❌ not wanted: git is only for developing the tool | |

## Delivery and operations

| ID | Requirement | Status | Issue |
|---|---|---|---|
| D1 | Connect via Claude CLI and different MCP servers | ✅ v0.1 | |
| D2 | Runs like a real application, nothing to install | 📋 | #1 |
| D3 | The .exe is built automatically by GitHub (GitHub Actions on each release tag, attached to the release) | 📋 | #1 |
| D4 | The git repository is only for developing the tool; live installations never use git and update by downloading a new version | ✅ | #17 |
| D5 | Client data is kept separate from the program, so updates never overwrite it | ✅ | #17 |
| D6 | `start.bat` must not open the browser before the app is ready | ✅ | #14 |
| D7 | Track improvements and bugs as GitHub issues | ✅ ongoing | |
| D8 | The design document lives in the repo so anyone can rebuild the tool | ✅ | [DESIGN.md](DESIGN.md) |
| D9 | Requirements tracked in this file | ✅ ongoing | |
| D10 | Licence for the repository | ❓ | #13 |

## Open questions

- Project start page details (#2: mockup review).
- The YAML reader covers the common subset only (#12).
