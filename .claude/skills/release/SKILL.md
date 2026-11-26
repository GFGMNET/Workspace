---
name: release
description: Use this when asked to publish a new version of Workspace (1.0 and later, Rust + Tauri), a beta, or an urgent fix version.
---

# Release a version of Workspace (1.0 and later)

Installed apps check GitHub Releases once a week and offer the update. Never put anything from a client's `data/` folder
into the repository or a zip. **No release without the maintainer's OK** (betas excepted). The rules for *when* a version is
released are in `CLAUDE.md` (complete beta → 5 test days → release); follow them, don't change them.

## Version numbers

- Normal versions: `1.0.1`, `1.0.2`, … · urgent fixes: four numbers `1.0.1.1` · betas for the next version (pre-releases,
  never offered to installed apps): ask which numbering the maintainer wants (for 1.0.1 it was `0.9.2.N`).
- The version comes from the workflow input, not from a file (`rust/Cargo.toml` stays as it is; changing it would also
  need a new `Cargo.lock`).

## Steps

1. `main` is clean; `npm test` passes; the latest `tests.yml` and `rust.yml` runs on `main` are green (Windows + Linux).
2. **Security gate** (skill `security-gate`): Rust security check and CodeQL green. Never release with a red one.
3. Release notes `docs/releases/vX.Y.Z.md` written as in `docs/releases/TEMPLATE.md` — **"## In short" is required**
   (the app's update window shows only that part). Plain words, for users.
4. Wiki pages of this version: move `docs/wiki-next/vX.Y.Z/*.md` into `docs/wiki/` (whole files), delete the folder, update
   the note in `docs/wiki-next/README.md`. This must happen **before** the build: the build copies `docs/wiki` into the app's help.
5. README: copy `docs/readme-next/README.md` over `README.md`; update the "Upcoming changes" table in both.
6. `docs/REQUIREMENTS.md`: set the statuses to ✅ with the version; plans: status line "Released in X.Y.Z".
7. Commit and push; wait for the checks.
8. Start the build (it builds, tests, signs, makes the help, publishes):
   ```
   gh api -X POST repos/GFGMNET/Workspace/actions/workflows/build-rust.yml/dispatches -f ref=main \
     -f 'inputs[version]=X.Y.Z' -F 'inputs[final]=true'      # beta: leave out final
   ```
   Never push to `main` while this build runs.
9. Check the release: `gh api repos/GFGMNET/Workspace/releases/latest` → tag, not a pre-release, assets
   `workspace-vX.Y.Z-windows-x64.zip`, `…-linux-x64.zip`, `workspace-signing.cer`, `SHA256SUMS`.
10. Close the milestone (`gh api -X PATCH repos/GFGMNET/Workspace/milestones/<n> -f state=closed`); issues closed by `Closes #n`.
11. Tell the maintainer in plain words: released, link, what is in it.

## Do not

- Create, edit or delete releases or tags directly (`gh release …` from Claude's environment is blocked) — the workflow does it.
- Reuse or move an existing tag (the workflow refuses an existing version).
- Release a Windows build that is not signed (the workflow refuses it).
