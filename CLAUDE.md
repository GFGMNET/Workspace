# Working on Project Workspace (rules for Claude and other agents)

Read this first. The maintainer is not a developer: talk to them in plain words, short, no jargon,
and only ask when a decision is really theirs.

## What this is

A file-based project workspace (no database) with a GUI, Claude CLI integration and VS Code.
- `app/` — today's version 0.x: Node.js server (`app/server.js`, `app/lib/`), screens (`app/public/`),
  desktop app (Electron, `app/electron/`), starter features/examples (`app/starter/`).
- `rust/` — version 1.0 in Rust + Tauri, **in progress**: `docs/MIGRATION-RUST.md` is the plan
  (phases, steps, status, decisions). Continue where its status table says.
- `docs/` — `DESIGN.md` (how everything works), `REQUIREMENTS.md` (everything wanted, with status),
  `GETTING-STARTED.md`, `wiki/` (published to the GitHub wiki by a workflow), `plans/` (planned features),
  `releases/vX.Y.Z.md` (release notes).
- `tests/contract/` + `tests/yaml-corpus/` — the safety net: the Rust version must pass the same tests as 0.x.

## Rules

- **Never** touch, copy or commit a client's `data/` folder. Test data lives in temp folders.
- **No release without the maintainer's OK** (exception: beta pre-releases `v1.0.0-beta.N` of the Rust version,
  which installed apps never pick up). Release steps: `.claude/skills/release/SKILL.md`.
- Every bug or improvement you find → a **GitHub issue** (labels: bug / enhancement / security; Rust work: milestone *v1.0 (Rust)*).
  Commits that fix one say `Closes #n`.
- Keep **docs current** with every change: DESIGN.md, REQUIREMENTS.md, the wiki pages in `docs/wiki/`, the next release
  notes in `docs/releases/`. Plain words, short sentences.
- Run `npm test` (unit checks) before committing; contract tests: `npm run test:contract`; YAML: `npm run test:yaml`.
- GitHub: use the REST API through `gh api` (GraphQL is blocked in Claude's environment). Releases and workflows are started
  with `gh api -X POST repos/GFGMNET/Workspace/actions/workflows/<file>/dispatches -f ref=main`. Creating/deleting releases
  directly is not allowed from Claude's environment — workflows do it.
- **Rust can't be built in Claude's environment** (crates.io is not reachable). Push to `main` and let
  `.github/workflows/rust.yml` build and test on GitHub (Linux + Windows); read the job logs with `gh api …/jobs/<id>/logs`.
  The workflow runs the YAML corpus (`PW_YAML_CMD`) and the contract tests (`PW_SERVER_CMD`) against the Rust binaries.
- Security: the server only listens on 127.0.0.1 with Host/Origin checks; app-private files (`.secrets.json`, `.ide-token`, `.app/`)
  are never served; secrets are never written into project folders (`${secret:name}` → `${PW_SECRET_NAME}`).

## Decisions already made (don't ask again)

- 0.x stays on Node/Electron until 1.0 replaces it; 1.0 = Rust + Tauri (go after the prototype, 2026-11-16).
- 1.0 drops the Node.js package (start.bat/start.sh); screens stay as files on disk; no macOS and no arm64 version (dropped 2026-11-18, #56, #64); Windows 11 only — Windows 10 not supported (#73).
- Signing: GitHub account is protected (done). Windows software is only released **signed**. SignPath Foundation declined (2026-11-19);
  1.0 for Windows **waits** for a signing way that fits (`docs/plans/RELEASE-TRUST.md` §6 — options and prices checked; don't offer
  the declined ones again: Microsoft Store, Certum, unsigned, paid ~€230+/year). 0.x stays unsigned. No signing keys on anyone's PC.
- 1.0 is called **Workspace** everywhere (window, tray, `Workspace.exe`, `workspace`, `workspace-server`, zips `workspace-v…`); decided 2026-11-18 (#77).
- Ticketsystem = GLPI 11 only, by entity, in v1.1 (osTicket dropped). Versions (Git first, then SVN; server by IP + port) in v1.2.
  The whole data folder is not versioned.
- Git history inside the app for the tool itself: not wanted (the tool's repo is only for development).
- The VS Code tab works; a focused layout is a later improvement (#62).

## Where the maintainer is needed

Decided 2026-11-16: **build everything first** (phases 2 and 3 without stopping), then the maintainer tests the beta once
(chat with the real Claude CLI, VS Code tab, tray, everything), **SignPath last** (just before 1.0), then the OK to release 1.0.
Version numbers: 0.9.0 = Rust beta (pre-release, unsigned), more betas as 0.9.0.N (e.g. 0.9.0.5, set with the input of build-rust.yml), 0.9.1 = signed, 1.0.0 = final.
Decided 2026-11-17: in 1.0 the window's X quits the app (no hiding to the tray).
Everything else: keep going and report progress briefly.
