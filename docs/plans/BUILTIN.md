# Plan: Built-in features: restore and update

**Ready 2 Deploy** (approved by the maintainer 2026-11-23) — issue #100

## 1) Name

Built-in features: restore and update

## 2) Planned release version

1.0.1 (all remaining plans in one version — maintainer's decision 2026-11-25; built from 27 Nov, released when everything is built and the beta test is OK)

## 3) Feasible? Checked per function, with the result

Checked with the app server and a data folder like a real one, on Windows and Linux.
Check: `docs/plans/checks/builtin-check.js` — GitHub Actions "Plan checks", plan = builtin (run 45167886679).

- Find the built-in features the user deleted — **OK**
- Restore only the ticked ones, exactly as shipped — **OK**
- A `version:` line in a feature's file is accepted — **OK**
- No higher version: nothing changes, even if the text differs — **OK**
- Update: the old one is kept as "… (deprecated)", the new one is installed — **OK**
- Existing projects keep the old one, with their own settings and comments — **OK**
- "Use the new version" switches one tab and keeps its own settings — **OK**
- New projects get the new version — **OK**
- A built-in feature without a new version is not touched — **OK**

Checked: 9 · Failed: 0 · Unchecked: 0

## 4) Description

- A **"Restore built-in features"** button on the Features page shows the built-in features that were deleted.
  The user ticks the ones to get back; they come back exactly as shipped.
- Every built-in feature has a **version number** in its file (`version: 2`). No number = version 1.
  An update only changes a feature whose number went up.
- When a built-in feature has a new version, the old one is kept as **"Name (deprecated)"** and the new one is
  installed. Existing projects keep working with the old one. New projects get the new one.
- In a project, a **"Use the new version"** button moves that tab to the new version. Its own settings stay.

## 5) Open points, only about this feature

None.

## 6) Decisions, only about this feature

1. Restore: the user ticks which deleted built-in features come back (A).
2. A new version = a higher `version:` number in the feature's file. If a feature didn't change, it is not updated.
3. On a new version: the old one is renamed to "(deprecated)", the new one is installed; existing projects keep the old one.
4. Switching to the new version: a button in the project (B).
5. If a "(deprecated)" copy already exists from an earlier update, the next one is `…_deprecated_2` (and so on).
6. If nothing is missing, the restore window says "All built-in features are there".
7. After an update, a short note: "Tasks has a new version. Your projects keep the old one until you switch."
8. The restore button is on the Features page.
9. Version 1.0.1, not 1.0.

## 7) Risks

- After several updates there can be many "(deprecated)" features in the list. They can be deleted once no project uses them.
- A user who changed a built-in feature without raising its number doesn't get that feature updated (their own change stays).

## 8) Detail workflow

1. App start after an update: compare each built-in feature's `version:` with the installed one.
2. Higher number: save the old one as `<key>_deprecated` (or `_deprecated_2`, …) named "Name (deprecated)",
   and write `feature: <key>_deprecated` into the projects that use it (only that line changes, comments stay).
3. Install the new one under the normal key and show the note.
4. Features page → Restore built-in features → tick → they come back as shipped
   (nothing missing → "All built-in features are there").
5. Project → "Use the new version" → the `feature: …_deprecated` line is removed from `project.yaml` → that tab uses
   the new one with its own settings.
