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
  Release notes are detailed for users — what is new or changed and how to use it — following `docs/releases/TEMPLATE.md`
  (decided 2026-11-24); the README table stays short.
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
- Ticketsystem = GLPI 11 only, by entity, in **1.0** (moved from 1.1 on 2026-11-19; osTicket dropped; #59 closes with the 1.0 release). Versions (Git first, then SVN; server by IP + port) in **1.0.1**. VS Code (VSCODE.md) is in **1.0** (decided 2026-11-24; it was already in the betas).
  **Versions (decided 2026-11-25): only two releases — 1.0 on 27 Nov (the tested version) and 1.0.1 with ALL remaining plans**
  (BUILTIN, VERSION-CONTROL, COMFYUI, FORGEJO, LAYOUTS, BLENDER, UNITY, UNREAL, LMSTUDIO, HELP, GODOT, OPENSCAD, FREECAD, DASHBOARD).
  Building starts on 27 Nov after the 1.0 release (not earlier, his choice), several features per test round; betas in between for him
  and his testers. **1.0.1 release rule (2026-11-25):** when everything is built, a complete 1.0.1 beta starts 5 test days; no bug
  (label `bug`) in those 5 days → 1.0.1 is released on day 5; a bug in those 5 days → the release moves ONCE by 5 days and brings all fixes;
  bugs found in the extra days go into the next version; hiccups never delay. A new feature asked for once the complete beta is out (test days or extra days) never goes into 1.0.1 — it goes into 1.0.2 (decided 2026-11-25). **Every version after 1.0.1 works the same way** (maintainer, 2026-11-25: "as quick and secure as possible"): he asks for a feature → plan → Ready 2 Deploy → built into the next version → complete beta → only then is the release date set (day 5 of the test days, or once 5 days later) — no release dates fixed in advance. **Several features in one version (2026-11-25):** for now (B) features he asks for go into the open version until he says "close 1.0.x"; then the complete beta is built and the test days start. Long term (C) a fixed collection period after the first request closes the version by itself — he says when to switch and how many days. When the complete beta is out, Claude sets a one-time
  scheduled task (cloud) for day 5 that applies this rule (security gate included). The old daily 5-day release train stays off.
  1.0 timing (2026-11-25): pre-flight check on 26 Nov 12:00 (security, tests, bugs — fix what is found); after that a CODE FREEZE:
  nothing changes on main until 1.0 is out, bugs reported after 26 Nov 12:00 go into 1.0.1. Release 27 Nov 06:00 (out ~06:30);
  building 1.0.1 starts 27 Nov 07:00 (waits if 1.0 isn't published yet — never push while the release build runs).
  (History: on 2026-11-24 the versions were 1.0.1–1.0.5 every 5 days; rule "rather merge releases than go up in the version number".)
  The whole data folder is not versioned.
- Git history inside the app for the tool itself: not wanted (the tool's repo is only for development).
- The VS Code tab works; a focused layout is a later improvement (#62).
- **Bugs and urgent fixes (decided 2026-11-25):** the maintainer alone decides bug or hiccup (he sets the label) and whether a bug is
  serious. Security holes are most likely serious; lost data is the user's responsibility (wiki Backup); "doesn't start" → FAQ first.
  A serious bug gets an urgent fix version with four digits (1.0.1 → 1.0.1.1; 1.0 → 1.0.0.1). The app compares all four numbers (#123). Test betas for 1.0.1 are numbered 0.9.2.N (decided 2026-11-25; never 1.0.0.N, which is for urgent fixes). He tests it as long as the fix needs; security holes are closed as soon as possible;
  the fix also goes into the next version, which keeps its date. Flowcharts for all workflows: `docs/*-WORKFLOW.md`.
- **Vote for features (decided 2026-11-25):** unplanned ideas are GitHub issues with the label `vote`, created only by the maintainer
  (or by Claude when he asks); users vote 👍/👎 on the first post (comments stay possible — locking would switch votes off too).
  List: wiki page `Vote-for-features` (in docs/wiki and docs/wiki-next) + README link; sorted by 👍. Votes never move a release.
  First idea: #118 Skills from the internet. The counts are written into the wiki page once a day by the "Publish wiki" workflow
  (`tools/vote-counts.js`, only on the built wiki page — never on main). Only ideas created by GFGMNET are listed (filter, 2026-11-25).
  Workflow for ideas from others (ask → new vote issue by him → close theirs with a link): `docs/IDEAS-WORKFLOW.md` — remind him of it.
- Feature requests from users (idea channel): **not cancelled — paused for review** (2026-11-23). Before going on, the whole workflow
  must be reviewed so it is not wonky and has no parts that can't be done. Latest idea (his): the user links his GitHub account in the app,
  sends "Request a new feature", it is saved on GitHub (repo `Workspace-requests`) and nothing happens until he approves; overview in the app
  (approved for all, own waiting ones), not approved in 15 days = rejected. Turned down (don't offer again): GitHub Discussions, e-mail,
  form services (Google/Microsoft/Tally), GLPI directly from the app, a "mailbox" receiver with automatic merging, Supabase, NocoDB.
  Not fitting: Fider (no bot protection), GLPI (no sign-up). Suggested, not decided: Discourse, PocketBase. Goal: as little spam as possible.
  Don't loop: no new tool suggestions one after another — first the review.

- Game prototypes (OpenGame, github.com/leigest519/OpenGame): **skipped** (2026-11-24) — the maintainer's rule was "only if it works
  with a smaller local model". Checked (plan check `opengame`, Qwen2.5-Coder 7B in LM Studio): no game, the model can't get through
  OpenGame's long instructions in time on a normal PC. Alternatives looked at: OpenGameBuilder (fixed game types, 5% royalty),
  Genex Desktop (no Windows). Don't offer again unless the maintainer brings it up.

- Skills from the internet (paste a skills.rest / skills.sh / GitHub link → info → install at your own risk): **later, not planned**
  (2026-11-25, "nice to have"). Checked and feasible (`docs/plans/checks/skills-online-check.js`, 18/18 on Windows + Linux); the plan
  draft had 6 open points (button, warning text, same name, size limit, keep the source, keys → Secrets). Only when he asks for it.

- **Security gate (decided 2026-11-24):** before every release (1.0 and each version after it) and when a version is built, the
  security checks run and must be clean: "Rust security check" (rust-security.yml, cargo-deny: known vulnerabilities in the
  1.0 app's libraries) and CodeQL (code scan). A finding is fixed first, like a bug (Rust library: Actions "Rust lock update"
  with the crate names → commit the new rust/Cargo.lock from branch `rust-lock-update`). Never release with a failing security check.

- **Pull requests from others (decided 2026-11-24):** only the maintainer and Claude change the repository; others fork it and send a
  pull request. Before the maintainer merges one, Claude checks it and tells him in plain words whether it's OK: what it changes,
  tests and security checks green (CI on Windows + Linux, Rust security check, CodeQL), no secrets or client data, the plan rules
  (a new function needs a plan the maintainer approved), docs updated. Only the maintainer merges. A built-in feature from a pull
  request (`app/starter/features/`) also gets a test before it goes into a release.

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
Release timing: 1.0 on 27 Nov 2026; then 1.0.1 with everything else: complete beta → 5 test days → release, or once 5 days later
if a bug is reported in the test days (decided 2026-11-25; the daily "release train" of 2026-11-23 is switched off).
The README as it should look after the next release is kept in `docs/readme-next/README.md`; the release copies it over `README.md`
(decided 2026-11-25) — keep it current with every change of that release.
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
