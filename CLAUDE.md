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
- Signing: GitHub account is protected (done). Windows software is only released **signed**. SignPath Foundation declined (2026-11-19).
  **Decided 2026-11-19: own (self-made) certificate, stored in the repository (no password) — plan
  `docs/plans/SIGNING.md`.** Earlier: 1.0 for Windows waited for a signing way that fits (`docs/plans/RELEASE-TRUST.md` §6 — options and prices checked; don't offer
  the declined ones again: Microsoft Store, Certum, unsigned, paid ~€230+/year). 0.x stays unsigned. No signing keys on anyone's PC.
  Before presenting any signing option: first check that a **private person in Germany** can buy/use it (with a source that
  says so) — if that can't be confirmed, don't present it. Checked and not possible: Azure Trusted Signing (companies only in the EU),
  Sectigo/Comodo (no individual purchase confirmed).
- 1.0 is called **Workspace** everywhere (window, tray, `Workspace.exe`, `workspace`, `workspace-server`, zips `workspace-v…`); decided 2026-11-18 (#77).
- Ticketsystem = GLPI 11 only, by entity, in v1.1 (osTicket dropped). Versions (Git first, then SVN; server by IP + port) in **v1.0.2** (decided 2026-11-19, moved from 1.0.1). VS Code (VSCODE.md) is **1.0.1** (decided 2026-11-23).
  The whole data folder is not versioned.
- Git history inside the app for the tool itself: not wanted (the tool's repo is only for development).
- The VS Code tab works; a focused layout is a later improvement (#62).
- Feature requests from users (idea channel): **not cancelled — paused for review** (2026-11-23). Before going on, the whole workflow
  must be reviewed so it is not wonky and has no parts that can't be done. Latest idea (his): the user links his GitHub account in the app,
  sends "Request a new feature", it is saved on GitHub (repo `Workspace-requests`) and nothing happens until he approves; overview in the app
  (approved for all, own waiting ones), not approved in 15 days = rejected. Turned down (don't offer again): GitHub Discussions, e-mail,
  form services (Google/Microsoft/Tally), GLPI directly from the app, a "mailbox" receiver with automatic merging, Supabase, NocoDB.
  Not fitting: Fider (no bot protection), GLPI (no sign-up). Suggested, not decided: Discourse, PocketBase. Goal: as little spam as possible.
  Don't loop: no new tool suggestions one after another — first the review.

## How plans are written (decided 2026-11-19, by the maintainer)

Every plan has exactly these parts, in this order:

1) Name:
2) Planned release version:
3) Feasible? Checked per function, with the result (simple list)
4) Description
5) Open points, only about this feature
6) Decisions, only about this feature
7) Risks
8) Detail workflow

The functions come from the maintainer — never plan from your own guess, ask first. Anything in a plan that is not the maintainer's
own words or decision (design details, extra checks, extra steps, suggestions) goes into point 5 as a question — never into
points 4, 6 or 8 as if decided. Before showing a plan, list yourself what in it was not requested. A function that is not checked
or whose check failed cannot be approved. Checks live in `docs/plans/checks/`. Before work starts, the maintainer
gets the open points and risks, and nothing begins until they have seen them. While building: if a step cannot be
done as planned, stop and ask the maintainer — no new design on your own.
A plan that is not **Ready 2 Deploy** when its version is due is skipped: it moves to a later version (decided 2026-11-19).
Release timing (decided 2026-11-23): 1.0 on 27 Nov 2026; then a new version every 5 days in plan order. If a GitHub issue
labelled **bug** is reported in those 5 days, the next version moves once by 5 days and brings all fixes together; bugs found in the
extra days go into the version after. Hiccups (no bug label) never delay a release. A daily scheduled task "Release train" does it.
Wiki pages of a version that is not out yet go into `docs/wiki-next/vX.Y.Z/` (not `docs/wiki/`, which is published on every push);
the release of that version moves them into `docs/wiki/` (see `docs/wiki-next/README.md`).
MCPs (decided 2026-11-20): named after the program they use (Blender, Unity, Unreal); use the existing solution if possible;
no checks and no test phase — instead a wiki article with what is needed and how to connect; switched on per project with `programs:` in `project.yaml` (not `mcp:`, that is the MCP connections feature; decided 2026-11-20);
no own beta for an MCP — it goes out with the release of its version; every result of an MCP is saved in the Workspace project, in the
folder named after the program (`blender/`, `unity/`, …; the app tells Claude in the chat). The **wiki article is required**: an MCP is
only released together with its wiki article (what is needed, how to connect the program and the app, an example for the chat).

## Where the maintainer is needed

Decided 2026-11-16: **build everything first** (phases 2 and 3 without stopping), then the maintainer tests the beta once
(chat with the real Claude CLI, VS Code tab, tray, everything), **signing last** (just before 1.0; own certificate, `docs/plans/SIGNING.md`), then the OK to release 1.0.
Version numbers: 0.9.0 = Rust beta (pre-release, unsigned), more betas as 0.9.0.N (e.g. 0.9.0.5, set with the input of build-rust.yml), 0.9.1 = signed, 1.0.0 = final.
Decided 2026-11-17: in 1.0 the window's X quits the app (no hiding to the tray).
Everything else: keep going and report progress briefly.
