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
6. Tag and push the tag:
   ```
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
7. The **Release** GitHub Action checks that the tag matches `package.json`, runs the tests,
   builds `project-workspace-vX.Y.Z.zip` and publishes the release with generated notes.
8. Edit the release notes on GitHub if needed — they are what users see under *What's new*.
9. Close the issues that went into the release.

## Do not

- Do not put anything from a client's `data/` folder into the repo or the zip.
- Do not reuse or move an existing tag.
