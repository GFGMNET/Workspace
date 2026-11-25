# Handover — state on 25 Nov 2026, 21:00 (Berlin)

For any assistant (Claude or another model) that takes over this project. Read **`CLAUDE.md` first**: it holds all
rules and the maintainer's decisions. This file says **where things stand** and **what comes next**, step by step.

## The maintainer

- Not a developer. Plain words, short answers, no jargon. Ask only when a decision is really his.
- **Never act without his OK** on anything he did not ask for (labels, posts, releases, deleting). He notices and minds.
- He decides: bug or hiccup, serious or not, which ideas become features, when a version is closed.
- Functions of a feature come from him. Never plan from your own guess (plan rules in `CLAUDE.md`).
- He makes the workflow flowcharts himself (`docs/workflow_*.md`). Don't create or redraw them unless he asks.

## Where things stand

| What | State |
|---|---|
| Latest full release | **v0.6.3** (old Electron app) |
| Latest beta | **v0.9.1.5** (Rust + Tauri, signed) — tested by the maintainer, no bugs |
| Program code since that beta | only #123 (update check compares four version numbers) — tests green |
| `main` | clean; tests, Rust (Windows + Linux), CodeQL, Rust security check: **all green** |
| Open bugs | **none** · open security issues: **none** · open pull requests: **none** |
| Release notes 1.0 | done: `docs/releases/v1.0.0.md` (template `docs/releases/TEMPLATE.md`) |
| README after 1.0 | done: `docs/readme-next/README.md` |
| Wiki for 1.0 | done: `docs/wiki-next/*.md` (FAQ, Known bugs/hiccups/security issues, Vote for features …) |
| Wiki for 1.0.1 | started: `docs/wiki-next/v1.0.1/FAQ.md` (1.0 FAQ + LM Studio). Until 1.0 is out, a change to `docs/wiki-next/FAQ.md` must also go into `v1.0.1/FAQ.md` |
| Plans for 1.0.1 | all 14 **Ready 2 Deploy** in `docs/plans/` (milestone *1.0.1*, issues #60, #93–#96, #100, #109–#116) |

## Timeline (Berlin time)

| When | What | Who does it |
|---|---|---|
| **26 Nov, 12:00** | **Pre-flight check for 1.0** (below). Afterwards **code freeze**: nothing changes on `main` until 1.0 is out (only security fixes). Bugs reported after 12:00 go into 1.0.1. | scheduled task (see "Scheduled tasks") or by hand |
| **27 Nov, 06:00** | **Release 1.0** (below), out ~06:30 | scheduled task in the cloud, or by hand |
| **27 Nov, 07:00** | **Start building 1.0.1** (below). Waits if 1.0 isn't out yet; never push while a release build runs | scheduled task or by hand |

### Pre-flight check (26 Nov, 12:00)

1. `git pull`. Start the Rust security check: `gh api -X POST repos/GFGMNET/Workspace/actions/workflows/rust-security.yml/dispatches -f ref=main`, wait for it.
   Check that the latest CodeQL run on `main` is green, and that there are no open issues with the label `security`.
2. Check that the latest `tests.yml` and `rust.yml` on `main` are green (Windows + Linux). Re-run if needed.
3. Look at open issues with the label `bug`.
4. Fix what came up. A Rust library finding: start `rust-lock-update.yml` with the crate names, then commit `rust/Cargo.lock` from branch `rust-lock-update`.
   A bug fix goes in with `Closes #n` and is added to `docs/releases/v1.0.0.md` (template style, including "In short"). Wait until everything is green.
5. Code freeze from now on.
6. Tell the maintainer in plain words: what was checked, what was found and fixed, that everything is green, that the code is frozen, and that 1.0 comes tomorrow at 06:00.

### Release 1.0 (27 Nov, 06:00)

1. Open bugs: don't fix them (code freeze). Put them into milestone *1.0.1* and list them in the report.
2. **Security gate:** run the Rust security check and wait. CodeQL must be green, and there must be no open `security` issues.
   A finding is fixed first (the only exception to the freeze). If it can't be fixed today: no release, tell the maintainer, try again the next day.
3. `rust.yml` green on Windows + Linux for the latest commit.
4. Check that v0.6.3 is the latest full release and that v1.0.0 doesn't exist yet. Update REQUIREMENTS.md D21 and the MIGRATION-RUST.md status.
   Commit "Release v1.0.0", push, then **push nothing while the build runs**.
5. Start the build: `gh api -X POST repos/GFGMNET/Workspace/actions/workflows/build-rust.yml/dispatches -f ref=main -f 'inputs[version]=1.0.0' -F 'inputs[final]=true'`.
   If the Linux runner stops with "shutdown signal", re-run the failed jobs.
6. Check the release page: a full release, marked latest, the Windows + Linux zips, `workspace-signing.cer`, `SHA256SUMS`, and the detailed release text.
7. Close milestone *v1.0 (Rust)* and its issues (#41, #49, #55, #59, #74, #105).
8. Only after 1.0.0 is out:
   - (a) Copy `docs/readme-next/README.md` over `README.md`.
   - (b) Copy every `.md` directly in `docs/wiki-next/` into `docs/wiki/`. Don't copy the sub-folder `v1.0.1/` or `README.md`. Copy `docs/wiki-next/GETTING-STARTED.md` over `docs/GETTING-STARTED.md`.
     Delete `docs/wiki/Beta-1.0.md`. Remove the copied files from `docs/wiki-next/`, but keep `docs/wiki-next/README.md` and `v1.0.1/`.
   - (c) Mark 0.x as deprecated: the v0.6.3 release text, DESIGN.md, REQUIREMENTS.md, and a note in CLAUDE.md that 0.x gets no more releases and the freeze is over.
   - (d) Keep `docs/readme-next/README.md` as the base for 1.0.1.
   - Commit and push. The wiki workflow then publishes the wiki.
9. Report to the maintainer in plain words.

### Building 1.0.1 (from 27 Nov, 07:00)

1. Check that v1.0.0 is out and no release build is running. Otherwise wait.
2. **First job: #125**, the clean-up. Remove the Electron app. Keep `app/public`, `app/starter`, `app/lib` (the contract test reference) and the old releases.
3. Then the 14 plans (BUILTIN, VERSION-CONTROL, COMFYUI, FORGEJO, LAYOUTS, BLENDER, UNITY, UNREAL, LMSTUDIO, HELP, GODOT, OPENSCAD, FREECAD, DASHBOARD).
   Follow each plan's "Detail workflow". If a step can't be done as planned, **stop and ask**.
4. Several features per test round, with betas in between: `build-rust.yml` with versions **0.9.2.N**. Never use 1.0.0.N, which is reserved for urgent fixes.
5. Keep green: tests on Windows + Linux, and the security gate on every build.
   Wiki pages go into `docs/wiki-next/v1.0.1/`. Keep `docs/readme-next/README.md` and `docs/releases/v1.0.1.md` current.
   An MCP only goes out with its wiki article.
6. When everything is built: a complete 1.0.1 beta → 5 test days → the release rule in `CLAUDE.md`.
   Set a one-time task for day 5 and tell the maintainer the date.

## Scheduled tasks (Claude's scheduler — only Claude runs them)

| Task | When | Runs in |
|---|---|---|
| Pre-flight check for 1.0 | 26 Nov 12:00 | Claude's chat session (on his computer GNVCL01) |
| Release 1.0 — cloud | 27 Nov 06:00 | a new Claude cloud session |
| Start building 1.0.1 | 27 Nov 07:00 | Claude's chat session |

If another assistant takes over, **switch these off** (or let them run and don't do the same steps twice). Otherwise two assistants could push at the same time. The steps above are the same as in the tasks.

## Working environment (Claude's — check what applies to you)

- GitHub: REST through `gh api` only. GraphQL is blocked. Releases are created by workflows, not by hand.
- Rust can't be built locally (crates.io is unreachable). Push to `main` and let `rust.yml` build and test on GitHub. Logs: `gh api …/jobs/<id>/logs`.
- Node `fetch` behind the proxy needs `NODE_USE_ENV_PROXY=1`.
- Before committing: `npm test`. Contract tests: `npm run test:contract`. YAML: `npm run test:yaml`.
- Commit messages end with the attribution lines your own tool asks for. Fixes say `Closes #n`.

## Automatic things on GitHub (so you don't wonder)

- **Publish wiki** (`wiki.yml`) runs on every push, daily, and when an issue labelled vote/bug/hiccup/security changes. It fills the lists on the wiki pages
  (`tools/vote-counts.js`, `tools/issue-list.js`). The copies in `docs/` keep a placeholder row on purpose.
- **Duplicate check** (`duplicate-check.yml`, made by the maintainer, extended by Claude) runs on new ideas (label `idea`) and bugs (label `bug`). It comments similar issues and adds `possible-duplicate`.
- **Rust security check** runs weekly. On a finding it opens an issue with the label `security-check`. The real problem then gets its own `security` issue.
- Form **New idea** (`.github/ISSUE_TEMPLATE/new-idea.yml`) adds the label `idea`.
- The weekly Electron check (`security.yml`) does nothing after 1.0, because the latest release has no Electron. It goes away with #125.

## Open questions / waiting for the maintainer

- Vote ideas waiting for votes: #118 (skills from the internet), #122 (working together in a shared folder), #124 (.gitignore in every new project).
- The idea channel in the app: paused for review (see `CLAUDE.md`). Don't suggest new tools.
- His own workflow charts: `docs/workflow_issue.md`, `docs/workflow_bug.md` (he is still making them).
