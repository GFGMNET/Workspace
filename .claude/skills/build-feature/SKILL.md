---
name: build-feature
description: Use when building a feature (or an upgrade of one) whose plan in docs/plans/ is Ready 2 Deploy — the steps from plan to tested commit, without changing the app's look.
---

# Build a feature from its plan

Only build what a plan in `docs/plans/<NAME>.md` describes, and only when it is **Ready 2 Deploy** (approved by the
maintainer). The plan's point 8 (detail workflow) is the list of steps. If a step can't be done as planned: **stop and ask**
the maintainer in plain words — no new design of your own.

## Before you start

1. Read the plan completely, its pictures in `docs/plans/img/`, and its check in `docs/plans/checks/`.
2. Read `docs/LAYOUT-AND-DESIGN.md`. The look is fixed: reuse the existing parts; add CSS only at the end of `app.css`.
3. Read `docs/AGENT-GUIDE.md` §3 (where things go).

## Typical pieces (only those the plan needs)

| Piece | Where |
|---|---|
| A new storage type (`stores:`) | `rust/crates/pw-core/src/workspace.rs`: `STORES`, `layouts()`, `default_layout()`, `count_items()` if it has no files |
| A new project setting (not a tab) | `META_KEYS` in `workspace.rs` (otherwise the key becomes a feature tab) |
| Server code that talks to another program | a new module `rust/crates/pw-server/src/<name>.rs`, `pub mod <name>;` and routes in `lib.rs` |
| Logic on files | `pw-core` (`items.rs`, `projects.rs`, …) — keep `pw-core` free of network code |
| The screen | `VIEWS.<layout>` in `app/public/views.js` |
| A built-in feature | `app/starter/features/<key>.yaml` (first comment line = description; raise `version:` when an existing one changes) |
| Settings with passwords / tokens | `${secret:name}` in `project.yaml`, resolved with `ws.secrets_resolve()` only while the request runs; never written to a file; masked in error texts |

## Tests

- Contract test `tests/contract/<name>.test.js` (Node `node:test`, helpers in `tests/contract/helpers.js`:
  `startServer`, `s.api`, `fakeHttp`). Features that exist only in Rust: `const RUST = !!process.env.PW_SERVER_CMD` and
  `{ skip: !RUST }`. Use fakes for other servers; never real accounts. Test data only in temp folders.
- Rust unit tests in the module (`#[cfg(test)]`) where it helps.
- Run `npm test` and `npm run test:contract` locally (Rust tests are skipped locally — Rust can't be built here).
- Push to `main`; `rust.yml` builds and tests on Linux and Windows. Read failed job logs:
  `gh api repos/GFGMNET/Workspace/actions/jobs/<id>/logs`. Fix and push again until green.

## Docs (same commit or the next)

- Wiki page for the next version in `docs/wiki-next/vX.Y.Z/` (whole page; starts with *What you need*), `_Sidebar.md` there too.
- `docs/DESIGN.md` (storage/layout table, routes), `docs/REQUIREMENTS.md` (status), release notes `docs/releases/vX.Y.Z.md`,
  `docs/readme-next/README.md`.
- Commit message names the feature and ends with `Closes #<issue>` and the attribution lines.

## Never

- Change the existing look, the sidebar, the tab row, colours or fonts.
- Add features, settings or extra steps the plan doesn't have — ask instead.
- Touch a client's `data/` folder.
