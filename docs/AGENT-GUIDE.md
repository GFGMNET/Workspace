# Agent guide: how to work on Workspace

For any AI model (or new developer) that takes over. It explains **how to build** and **what to consider**.
The rules and the maintainer's decisions are in [`CLAUDE.md`](../CLAUDE.md) — they win over anything here.

## 1. Read in this order

1. [`CLAUDE.md`](../CLAUDE.md) — rules and every decision (don't ask again what is decided there).
2. [`docs/HANDOVER.md`](HANDOVER.md) — where things stand, what comes next.
3. This guide.
4. [`docs/LAYOUT-AND-DESIGN.md`](LAYOUT-AND-DESIGN.md) — the fixed look. **Read before touching any screen.**
5. [`docs/SKILLS.md`](SKILLS.md) — step lists for release, security gate, building a feature, writing a plan, checking a pull request.
6. [`docs/DESIGN.md`](DESIGN.md) — how everything works (files, settings, routes, security). Look things up there.

## 2. The maintainer

- Not a developer. **Plain words, short sentences, no jargon.** Ask only when a decision is really his.
- **Nothing he didn't ask for without his OK**: no labels, posts, comments, closing, releases, deleting, new tools, new rules.
  Doing something he didn't ask for has cost trust before.
- When he gives a list of steps, do them **in that order, nothing added, no warnings** he said he doesn't want.
- He decides: bug or hiccup, serious or not, which ideas become features, when a version is closed, the look of the app.
- He draws the workflow flowcharts himself (`docs/workflow_*.md`) — don't create or change them.
- Report progress briefly; tell him when something is done.

## 3. The project in one page

- **What:** a desktop app (Windows 11 x64, Linux x64) for many kinds of projects. No database: everything is files in a
  `data/` folder. `project.yaml` lists *which* features a project has (each becomes a tab); `data/features/<key>.yaml` says
  *what* a feature is: `stores:` (how it is saved) + `layout:` (how it looks).
- **Version:** 1.0.1 (26 Nov 2026). The app is **Rust + Tauri**. The old 0.x (Node + Electron) is deprecated.
- **Where things go:**

| You want to … | Go to |
|---|---|
| change file logic (features, projects, items, YAML, secrets, search) | `rust/crates/pw-core/src/` |
| add or change an HTTP route, talk to another program | `rust/crates/pw-server/src/` (routes: `lib.rs`) |
| change the window, tray, reminders | `rust/crates/pw-app/src/main.rs` |
| add a screen for a layout | `app/public/views.js` (`VIEWS.<layout>`) — keep the look (LAYOUT-AND-DESIGN.md) |
| add a built-in feature | `app/starter/features/<key>.yaml` |
| add tests | `tests/contract/<name>.test.js` (and Rust `#[cfg(test)]`) |
| write user docs | `docs/wiki/` (published on every push!) or `docs/wiki-next/vX.Y.Z/` for a version not out yet |

- `app/server.js` and `app/lib/` are the **old 0.x server**. They stay only as the reference the contract tests were written
  against. Don't add features there.

## 4. Your environment (what doesn't work, and the way around)

| Limit | Way around |
|---|---|
| Rust can't be built (crates.io not reachable) | push to `main`; `.github/workflows/rust.yml` builds and tests on Linux + Windows. Read logs: `gh api repos/GFGMNET/Workspace/actions/jobs/<id>/logs` |
| `rust.yml` only runs when `rust/**`, `app/public/**`, `tests/**` change | docs-only commits don't start it; check the last code commit's run |
| GitHub GraphQL is blocked | use the REST API: `gh api …` |
| creating/editing/deleting releases directly is blocked | workflows do it (`build-rust.yml`); release text changes: the maintainer does them |
| a new crate or a crate update needs `Cargo.lock` | workflow *Rust lock update* (`rust-lock-update.yml`, input `crates`), then take `rust/Cargo.lock` from branch `rust-lock-update`. Builds use `--locked` |
| no access to the maintainer's PC unless linked | ask him to attach files, or do what can be done here |

Commands: `npm test` (unit checks + screen syntax), `npm run test:contract` (API tests; Rust-only tests skip locally),
`npm run test:yaml` (YAML corpus). Start workflows: `gh api -X POST repos/GFGMNET/Workspace/actions/workflows/<file>/dispatches -f ref=main`.
**Never push while a release build (`build-rust.yml`) runs.**

## 5. The working loop

1. Plan approved (*Ready 2 Deploy*) → build only what it says (skill `build-feature`). Stuck → ask, don't redesign.
2. Change code → `npm test` → `npm run test:contract` → commit (message says what, `Closes #n`, the attribution lines
   from CLAUDE.md / the system) → `git pull --rebase` → push.
3. Wait for `tests.yml`, `rust.yml`, `codeql.yml`, `rust-security.yml` on that commit. Red → read the job log, fix, push.
4. Docs in the same or the next commit: wiki page, DESIGN.md, REQUIREMENTS.md, release notes, readme-next.
5. Every bug or improvement you find → a GitHub issue (labels bug / enhancement / security) — but don't set or remove labels
   on issues others opened without his OK.

## 6. Things that bite (learned the hard way)

- **New project setting** (like `programs:`, `dashboard:`): add it to `META_KEYS` in `pw-core/src/workspace.rs`, or it turns into a tab.
- **New storage type:** `STORES`, `layouts()`, `default_layout()`; stores without files → `count_items()` returns 0;
  `links.rs` ignores unknown stores (safe), check search/index if the new store has text.
- **project.yaml changes** must keep comments: use `yaml::update_mapping`, never rewrite the file.
- **Secrets:** `${secret:name}` → resolved only while a request runs (`ws.secrets_resolve`), never written to disk, masked in
  errors. In `.mcp.json` they become `${PW_SECRET_NAME}`.
- **Security:** server only on `127.0.0.1` with Host/Origin checks; every path through the safe-join helpers; app-private
  files (`.secrets.json`, `.ide-token`, `.app/`) are never listed or served. External programs: no shell strings, pass
  arguments as a list; turn off hooks/auto-features of tools you start (see `vcs.rs` for Git).
- **Windows + Linux:** tests run on both. Paths with `\`, `python` vs `python3`, `.exe` names, line endings.
- **Rust-only tests** need `{ skip: !process.env.PW_SERVER_CMD }`, otherwise they fail against the old Node server locally.
- **Help inside the app** is built from `docs/wiki` at release time — move `docs/wiki-next/vX.Y.Z/` into `docs/wiki/` *before* the build.
- **`docs/wiki/` is published on every push** — pages for a version not out yet go to `docs/wiki-next/vX.Y.Z/`.
- **Never** touch, copy or commit a client's `data/` folder (there may be one in the repo folder, untracked — leave it).
- **The look is fixed.** Changing the app's layout while adding features happened once and was not OK.

## 7. CI workflows (`.github/workflows/`)

| File | What |
|---|---|
| `tests.yml` | `npm test`, contract tests against the old Node server, YAML corpus, UI layout tests (Chromium + WebKit) |
| `rust.yml` | builds Rust on Linux + Windows, Rust unit tests, contract tests + YAML corpus against the Rust binaries |
| `rust-security.yml` | cargo-deny (vulnerabilities, licences, sources); on change and every Monday |
| `codeql.yml` | code scan on every push and weekly |
| `security.yml` | bundled JS libraries check |
| `build-rust.yml` | the release build (inputs `version`, `final`): sign, help pages, SHA256SUMS, publish |
| `wiki.yml` | publishes `docs/wiki` to the GitHub wiki; fills vote counts and bug lists |
| `plan-checks.yml` | runs a plan's checks (`docs/plans/checks/`) on Windows + Linux |
| `rust-lock-update.yml`, `rust-vendor.yml`, `update-vendor.yml` | library updates |
| `duplicate-check.yml` | marks possible duplicate ideas / bugs |
| `signing-cert.yml`, `ide-check.yml` | certificate and VS Code checks |

## 8. Words

| Word | Meaning |
|---|---|
| feature | a tab type, defined in `data/features/<key>.yaml` |
| built-in feature | one that comes with the app (`app/starter/features/`) |
| store / layout | how a feature is saved / how it looks |
| plan | `docs/plans/<NAME>.md`, 8 parts, approved = *Ready 2 Deploy* |
| complete beta / test days | all features of a version built → 5 days of testing → release (CLAUDE.md) |
| urgent fix | a four-number version (1.0.1.1) for a serious bug or a security hole |
| hiccup | a small problem the maintainer decided is not a bug |
| security gate | Rust security check + CodeQL must be green before a release |
