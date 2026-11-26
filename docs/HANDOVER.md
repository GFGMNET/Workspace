# Handover — state on 26 Nov 2026 (Berlin)

For any assistant (Claude or another model) that takes over this project. Read **`CLAUDE.md` first**: it holds all
rules and the maintainer's decisions. Then **[AGENT-GUIDE.md](AGENT-GUIDE.md)** (how to build, what to consider) and
**[LAYOUT-AND-DESIGN.md](LAYOUT-AND-DESIGN.md)** (the fixed look). This file says **where things stand** and **what comes next**.

## The maintainer

- Not a developer. Plain words, short answers, no jargon. Ask only when a decision is really his.
- **Never act without his OK** on anything he did not ask for (labels, posts, releases, deleting, new tools). He notices and minds.
- When he gives steps in an order: do them in that order, nothing added, no extra warnings.
- He decides: bug or hiccup, serious or not, which ideas become features, when a version is closed, how the app looks.
- Functions of a feature come from him. Never plan from your own guess (skill `write-plan`).
- He makes the workflow flowcharts himself (`docs/workflow_*.md`). Don't create or redraw them unless he asks.
- **Don't change the app's layout.** A previous handover ended with another model rebuilding the whole layout — that was not OK.
  New features reuse the existing look (LAYOUT-AND-DESIGN.md).

## First: the transfer checklist

**[TRANSFER-CHECKLIST.md](TRANSFER-CHECKLIST.md)** — what the maintainer still has to do for the switch, and what is not obvious for a new assistant.

## Then: things done without being asked

On 26 Nov 2026 Claude did some things beyond the maintainer's steps. They are listed in
**[NOT-REQUESTED-2026-11-26.md](NOT-REQUESTED-2026-11-26.md)**. Ask him about each point (keep or undo) before other work.
What was forgotten or couldn't be finished (release texts on GitHub, screenshots, help in the installed app) is in
**[FORGOTTEN-2026-11-26.md](FORGOTTEN-2026-11-26.md)**.

## Lines in CLAUDE.md that are history now — don't act on them

`CLAUDE.md` was not changed after 1.0.1 (the maintainer's wish: don't update the rules). Some of its lines describe a timeline
that is **already over**. They are history, **not tasks**:

| Line in CLAUDE.md | What really happened |
|---|---|
| "`rust/` — version 1.0 in Rust + Tauri, **in progress** … Continue where its status table says." | Done. 1.0.0 and 1.0.1 are released; MIGRATION-RUST.md is history. |
| "`app/` — today's version 0.x: Node.js server …, desktop app (Electron, `app/electron/`)" | The Electron app was removed (#125). `app/public` + `app/starter` are the screens and built-in features of the Rust app; `app/server.js` + `app/lib/` are only the old reference for the contract tests. |
| "exception: beta pre-releases `v1.0.0-beta.N`" | Betas were numbered 0.9.0.N / 0.9.1.N. For the next version, ask the maintainer how betas are numbered. |
| "only two releases — 1.0 on 27 Nov … and 1.0.1 with ALL remaining plans … Building starts on 27 Nov" | 1.0.0 **and** 1.0.1 were both released on **26 Nov 2026**, at the maintainer's request, 1.0.1 as a final release **without a beta and without test days**. |
| "Test betas for 1.0.1 are numbered 0.9.2.N" | No 0.9.2.N beta was made. |
| "1.0 timing (2026-11-25): pre-flight check on 26 Nov 12:00 … CODE FREEZE … Release 27 Nov 06:00 … building 1.0.1 starts 27 Nov 07:00" | **Over. No pre-flight, no code freeze, no release on 27 Nov.** Nothing is scheduled. |
| "#59 closes with the 1.0 release" | Closed. |
| "Release timing: 1.0 on 27 Nov 2026; then 1.0.1 …" (plan section) | Over (see above). |
| Section "Where the maintainer is needed" (build first, beta test, signing last, versions 0.9.0 / 0.9.1 / 1.0.0) | All done. Signing is in place since 0.9.1. |

**Still valid** for every version from now on: the release rule (complete beta → 5 test days → release, once 5 days later on a
bug), urgent fixes with four numbers, the security gate, the plan rules, the bug/hiccup rules, the vote rules and everything
under "Rules". The next open version is **1.0.2**.

## Where things stand

| What | State |
|---|---|
| Latest release | **v1.0.1** (26 Nov 2026, full release, signed): Version Control, ComfyUI, Forgejo, 6 text layouts, Dashboard, Help in the app, LM Studio, MCPs (Blender, Unity, Unreal, Godot, OpenSCAD, FreeCAD), restore built-in features |
| Before that | **v1.0.0** (26 Nov 2026) — first Rust + Tauri release. 0.x (Electron) is deprecated; last 0.x release 0.6.3 |
| How 1.0.1 was released | at the maintainer's request (26 Nov): 1.0 and then 1.0.1 **final, without a beta** and without the 5 test days. The release rules in `CLAUDE.md` were **not** changed — they still apply to the next versions |
| `main` | clean; tests, Rust (Windows + Linux), CodeQL, Rust security check: **all green** |
| Milestones | *v1.0 (Rust)* and *1.0.1* closed. *1.0.2* … *1.0.5* exist and are empty |
| Open bugs | **none** · open security issues: **none** · open pull requests: **none** |
| Open issues | #62 (VS Code tab: focused layout, later) · vote ideas #118, #122, #124 |
| Plans | all in `docs/plans/` are released (status line "Released in …"). No plan is waiting |
| Wiki | `docs/wiki/` is current for 1.0.1; `docs/wiki-next/` has no waiting pages |
| README | `README.md` = `docs/readme-next/README.md` (current; "Upcoming changes": nothing planned) |

## What comes next

Nothing is scheduled. When the maintainer asks for something:

1. **A new feature or an upgrade** → skill `write-plan` (functions from him, open points as questions, checks) → he approves
   (*Ready 2 Deploy*) → skill `build-feature` → it goes into the open version (1.0.2) until he says "close 1.0.2"
   → complete beta → 5 test days → release (rules in `CLAUDE.md`; skill `release`).
2. **A bug** (he sets the label `bug`) → fix it in the next version; a serious one or a security hole → urgent fix version
   with four numbers (1.0.1.1) as soon as possible.
3. **A pull request from someone else** → skill `check-pull-request`; only he merges.
4. **Ideas from others** → remind him of the vote workflow (he creates the vote issue, closes theirs with a link).

Ideas already looked at and set aside (don't offer again unless he asks): see `CLAUDE.md` (OpenGame, skills from the internet,
feature-request tools, signing options).

## Scheduled tasks

None. All earlier scheduled tasks were switched off on 25 Nov 2026. If a complete beta of a version goes out, the rule in
`CLAUDE.md` says to set a one-time task for test day 5 — only with a scheduler you actually have; otherwise tell him the date.

## Working environment (check what applies to you)

- GitHub: REST through `gh api` only. GraphQL is blocked. Releases are created by workflows, not by hand.
- Rust can't be built locally (crates.io is unreachable). Push to `main` and let `rust.yml` build and test on GitHub. Logs: `gh api …/jobs/<id>/logs`.
- Node `fetch` behind the proxy needs `NODE_USE_ENV_PROXY=1`.
- Before committing: `npm test`. Contract tests: `npm run test:contract`. YAML: `npm run test:yaml`.
- Commit messages end with the attribution lines your own tool asks for. Fixes say `Closes #n`.

## Automatic things on GitHub (so you don't wonder)

- **Publish wiki** (`wiki.yml`) runs on every push, daily, and when an issue labelled vote/bug/hiccup/security changes. It fills the lists on the wiki pages
  (`tools/vote-counts.js`, `tools/issue-list.js`). The copies in `docs/` keep a placeholder row on purpose.
- **Duplicate check** (`duplicate-check.yml`) runs on new ideas (label `idea`) and bugs (label `bug`). It comments similar issues and adds `possible-duplicate`.
- **Rust security check** runs weekly. On a finding it opens an issue with the label `security-check`. The real problem then gets its own `security` issue.
- Form **New idea** (`.github/ISSUE_TEMPLATE/new-idea.yml`) adds the label `idea`.
- **Bundled libraries** (`security.yml`) checks Mermaid and highlight.js.

## Open questions / waiting for the maintainer

- Vote ideas waiting for votes: #118 (skills from the internet), #122 (working together in a shared folder), #124 (.gitignore in every new project).
- The idea channel in the app: paused for review (see `CLAUDE.md`). Don't suggest new tools.
- His workflow charts: `docs/workflow_issue.md`, `docs/workflow_bug.md`, `docs/workflow_hiccup.md`, `docs/workflow_secruity.md` (his; leave them).
