---
name: security-gate
description: Use before every release and whenever a version is built, to run and read the security checks (Rust security check with cargo-deny, CodeQL).
---

# Security gate (decided 2026-11-24)

Before every release, the security checks must be clean. A finding is fixed first, like a bug.

1. Start the Rust security check and wait for it:
   `gh api -X POST repos/GFGMNET/Workspace/actions/workflows/rust-security.yml/dispatches -f ref=main`
   then `gh api "repos/GFGMNET/Workspace/actions/workflows/rust-security.yml/runs?per_page=1" --jq '.workflow_runs[0] | .status + " " + (.conclusion // "")'`.
2. CodeQL: the latest run of `codeql.yml` on the commit you release must be `success`.
3. Open issues with the label `security`: `gh api "repos/GFGMNET/Workspace/issues?labels=security&state=open"` — must be none (or the maintainer decided otherwise).
4. A finding in a Rust library: start *Rust lock update* with the crate names
   (`gh api -X POST …/actions/workflows/rust-lock-update.yml/dispatches -f ref=main -f 'inputs[crates]=name1 name2'`),
   then take the new `rust/Cargo.lock` from branch `rust-lock-update`, commit it on `main`, and run step 1 again.
5. A finding in our own code (CodeQL): fix it, push, wait for green. Open an issue with the label `security` only for a real problem.
6. A security finding in a version that is already out is always an **urgent fix version** (four numbers), as soon as possible.
