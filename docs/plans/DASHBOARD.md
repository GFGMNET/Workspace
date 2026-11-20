# Plan: Dashboard

## 1) Name

Dashboard

## 2) Planned release version

1.2.6

## 3) Feasible? Checked per function, with the result

| part | desc | state | suggestion |
|---|---|---|---|
| Edit | "Edit" button on the Overview → edit mode | unchecked | test page in the browser engines the app uses (Windows: Chromium-based, Linux: WebKit), on GitHub's machines |
| Blocks | add a block: what (any feature of the project) + show as (number or list) + simple filter (+ how many, for lists) | unchecked | every kind of feature gives a count and a list with a filter — app server with test data |
| Blocks | remove, move and resize blocks | unchecked | the same test page, with the mouse, Windows and Linux |
| Project | each project has its own dashboard, saved and loaded again | unchecked | app server |
| Start | new and existing projects start with an empty dashboard | unchecked | app server |

Checked: 0 · Unchecked: 5 · Failed: 0

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

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | An "Edit" button on the Overview; in edit mode blocks are added, removed, moved and resized. |
| 2 | For now: show as **number** or **list** (no charts, no pages). |
| 3 | A simple filter per block (e.g. "open", "pending", "label = bug"). |
| 4 | Per project: each project has its own dashboard. |
| 5 | New and existing projects start with an empty dashboard. |

## 7) Risks

Written after the checks.

## 8) Detail workflow

Written after the checks and the open points.
