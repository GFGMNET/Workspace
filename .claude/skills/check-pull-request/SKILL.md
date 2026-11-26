---
name: check-pull-request
description: Use when someone else sent a pull request and the maintainer must be told in plain words whether it is OK to merge.
---

# Check a pull request (decided 2026-11-24)

Only the maintainer merges. Your job is a plain-words verdict.

1. Read it: `gh api repos/GFGMNET/Workspace/pulls/<n>` and `…/pulls/<n>/files`.
2. Check and report each point:
   - **What it changes**, in one or two sentences.
   - **Checks green:** CI on Windows + Linux (`tests.yml`, `rust.yml`), Rust security check, CodeQL
     (`gh api repos/GFGMNET/Workspace/commits/<head sha>/check-runs`).
   - **No secrets and no client data** (no `data/` folder, no tokens, no `.secrets.json`).
   - **Plan rules:** a new function needs a plan the maintainer approved (Ready 2 Deploy).
   - **The look is unchanged** (`docs/LAYOUT-AND-DESIGN.md`): no changed existing CSS rules, sidebar, tabs, colours.
   - **Docs updated** (wiki page, DESIGN, REQUIREMENTS, release notes).
   - A built-in feature (`app/starter/features/`) also needs a test before it goes into a release.
3. Tell him: OK to merge, or what is missing. Don't comment on GitHub, label, merge or close without his OK.
