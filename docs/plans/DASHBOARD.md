# Plan: Dashboard

## 1) Name

Dashboard

## 2) Planned release version

1.2.6

## 3) Feasible? Checked per function, with the result

| part | desc | state | result |
|---|---|---|---|
| Edit | "Edit" button on the Overview → edit mode | checked OK | test page, Chromium (Windows) and WebKit (Linux) on GitHub's machines |
| Blocks | add a block: what (any feature of the project) + show as (number or list) + simple filter (+ how many, for lists) | checked OK | every kind of feature gives a number and a list with a filter: wiki, records (tasks, team, map …), files, diagrams, chat, GitHub issues ("label = bug"), GLPI tickets ("state = pending") |
| Blocks | remove, move and resize blocks | checked OK | with the mouse, Chromium and WebKit |
| Project | each project has its own dashboard, saved and loaded again | **failed** | saved and kept in `project.yaml` (also after the project is changed), other projects untouched — **but the app reads `dashboard:` as a feature**, so it would show up as an extra tab. See open point 5. |
| Start | new and existing projects start with an empty dashboard | checked OK | app server |

Checked: 4 · Unchecked: 0 · Failed: 1 — check run 2026-11-20 (`docs/plans/checks/dashboard-check.js`, GitHub Actions "Plan checks", plan = dashboard)

## 4) Description

An "Edit" button on the project's Overview. In it you add blocks, remove them, move them and change their size. A block shows
"what" (anything the project has, e.g. GitHub issues) "as" a number or a list, with a simple filter. Each project has its own
dashboard; new and existing projects start empty. Discussion screen: [dashboard-edit.png](img/dashboard-edit.png).

## 5) Open points, only about this feature

| id | question |
|---|---|
| 1 | Saved in `project.yaml` under `dashboard:` (one entry per block: what, show as, filter, how many, place, size) — OK? |
| 2 | The tab is called "Overview" today — stay "Overview" or become "Dashboard"? |
| 3 | Today `overview: false` hides the tab completely — should that stay possible? |
| 4 | Size: a grid 4 blocks wide; a block 1–4 wide and 1–3 high — OK? |
| 5 | Failed check "Project": today every list in `project.yaml` becomes a feature. Suggestion: the app treats `dashboard:` as a setting of the project, not as a feature (like `name:` or `overview:`). Then the check runs again. OK? |

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | An "Edit" button on the Overview; in edit mode blocks are added, removed, moved and resized. |
| 2 | For now: show as **number** or **list** (no charts, no pages). |
| 3 | A simple filter per block (e.g. "open", "pending", "label = bug"). |
| 4 | Per project: each project has its own dashboard. |
| 5 | New and existing projects start with an empty dashboard. |

## 7) Risks

| id | risk | suggestion |
|---|---|---|
| 1 | Check "Project" failed: `dashboard:` is read as a feature (extra tab). Not approvable until fixed and checked again. | Open point 5. |
| 2 | A project that already has its own feature called `dashboard` would clash with the new dashboard. | The app warns when a project already has a `dashboard` feature; to be checked with the fix of open point 5. |

## 8) Detail workflow

Written after the checks and the open points.
