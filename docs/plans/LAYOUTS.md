# Plan: More layouts for text

**Ready 2 Deploy** (approved by the maintainer 2026-11-24) — issue #116

## 1) Name

More layouts for text

## 2) Planned release version

1.0.1 — 2 Dec 2026 (maintainer: "as soon as possible")

## 3) Feasible? Checked per function, with the result

Checked with the 1.0 app server and a temp data folder, and in Chromium (like WebView2 on Windows) and WebKit (like WebKitGTK
on Linux), on Windows and Linux. Check: `docs/plans/checks/layouts-check.js` — GitHub Actions "Plan checks", plan = layouts
(run 45350037403).

- Journal: several entries per day (also with the same title), grouped by year / month — **OK**
- Book: chapters and their pages in order, previous / next, "page x of y" — **OK**
- Book: full screen and back (Chromium and WebKit) — **OK**
- Sticky notes: a color per page, kept and changeable — **OK**
- Board: `columns:` in a text feature's file; moving a page changes only its column line — **OK**
- Board: drag & drop into another column (Chromium and WebKit) — **OK**
- Table: edit a cell in place; only that value changes (also with ":" in it) — **OK**
- Table: a page without a top part gets one when a cell is filled — **OK**
- Blog: contents with the headings of each page; a click jumps there — **OK**
- Pages with a top part are still found by the search — **OK**

Checked: 20 · Failed: 0 · Unchecked: 0

## 4) Description

Six new layout options for text features (`stores: markdown`). Anyone who creates or edits a feature can choose them, like
`pages`, `cards` or `list` today. Existing features don't change.

- **Journal:** several entries per day, grouped by year and month.
- **Book (ebook):** contents on the left (can be hidden), one page in the middle, A− / A+, previous / next, progress, full screen.
- **Sticky notes:** a color per note, in a grid; a click opens the full page.
- **Board:** Kanban for text pages; columns set in the feature file.
- **Table:** the pages as a table, editable directly in the table.
- **Blog:** contents on the left, the pages one after another on the right.

Screens (mock-ups, approved): [Board](img/layouts-board.png) · [Book](img/layouts-ebook.png) ·
[Book, contents hidden](img/layouts-ebook-hidden.png) · [Blog](img/layouts-blog.png)

## 5) Open points, only about this feature

None.

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | All six layouts, in 1.0.1. |
| 2 | Journal: several entries per day; grouped by year / month. |
| 3 | Book: like an ebook; the contents can be hidden; full screen. |
| 4 | Sticky notes: color selectable; in a grid (not placed freely); a click opens the full page. |
| 5 | Board: Kanban for text pages. |
| 6 | Table: a normal table, editable directly in the table. |
| 7 | Blog: contents left, pages right (screen OK). |
| 8 | Layout words: `journal`, `book`, `notes`, `board`, `table`, `blog`. |
| 9 | Date, chapter, order, color, column and other fields are kept in a short block at the top of each page; the page stays normal text. |
| 10 | Journal: "New" creates an entry with today's date and time; newest first. |
| 11 | Book: chapter order by drag & drop in the contents (stored as a number); the text size (A− / A+) is remembered. |
| 12 | Sticky notes: 6 colors — yellow, green, blue, pink, orange, grey. |
| 13 | Board: a page without a column goes into the first column; without `columns:` the columns are Idea / In progress / Done. |
| 14 | Table: columns = title, tags, last changed, plus every field found at the top of the pages. |
| 15 | Blog: newest page first (by date); contents show headings down to level 3. |
| 16 | A search bar in all six (`search: false` hides it). |

## 7) Risks

| id | risk | what happens |
|---|---|---|
| 1 | 1.0.1 is very full (built-in features, Version Control, ComfyUI, Forgejo and these six layouts). | Whatever isn't finished by 2 Dec moves to 1.0.2 by itself (release rule). |
| 2 | Full screen was checked in the browser engines of Windows and Linux, not in the finished app window. | The maintainer tests it once in the beta. |
| 3 | "Board" and "Kanban" look alike. | Kanban stays for records (tables), Board is for text pages; the wiki explains the difference. |

## 8) Detail workflow

| id | desc |
|---|---|
| 1 | The six layouts are allowed for `stores: markdown` (0.x `app/lib/workspace.js` LAYOUTS and the Rust `pw-core`), with a small preview in *New feature*. The list of text pages also returns the fields from the top of each page. |
| 2 | One view per layout in `app/public/views.js`, using the same building blocks (search bar, *New*, opening a page). Values are read from and written to the top of the page; only the changed line is rewritten (as in the check). |
| 3 | Automatic tests for all six in Chromium and WebKit on Windows and Linux (`tests/ui/`), plus the plan check before the release. |
| 4 | Wiki: a page per layout with an example, in `docs/wiki-next/v1.0.1/`; the layout list on the Features page; DESIGN.md, REQUIREMENTS.md, release notes `docs/releases/v1.0.1.md`. |
| 5 | The maintainer tests them in the beta (incl. full screen in the app window). |
| 6 | Release with 1.0.1. |
