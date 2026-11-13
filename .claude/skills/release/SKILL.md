---
name: release
description: Use this when asked to publish a new version of Project Workspace.
---

# Release a new version

Installed workspaces check GitHub Releases once a week and offer the update, so a release
reaches every client within a week. Never break `data/`: it belongs to the client.

## Steps

1. Make sure `main` is clean and `npm test` passes.
2. Pick the version (semantic versioning: bug fixes → patch, new features → minor).
3. Set `"version"` in `package.json` to it.
4. Update `docs/REQUIREMENTS.md` (statuses) and anything in `docs/` that changed.
5. Commit: `Release vX.Y.Z` and push to `main`.
6. Write the release notes in `docs/releases/vX.Y.Z.md` — they are what users see under *What's new*
   (keep them short and in plain words; without the file GitHub generates notes).
7. Start the release: GitHub → **Actions → Release → Run workflow** (or the API:
   `POST /repos/GFGMNET/Workspace/actions/workflows/release.yml/dispatches` with `ref: main`).
   Pushing a tag `vX.Y.Z` works too.
8. The **Release** Action creates the tag `v<version from package.json>`, runs the tests,
   builds `project-workspace-vX.Y.Z.zip` and publishes the release.
9. Close the issues that went into the release.

## Do not

- Do not put anything from a client's `data/` folder into the repo or the zip.
- Do not reuse or move an existing tag.
