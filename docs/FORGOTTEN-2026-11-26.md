# What Claude forgot or could not finish (26 Nov 2026)

Claude forgot these things while releasing 1.0 / 1.0.1 and updating the documentation, or could not do them from its work
environment. The maintainer had to point out the gaps in the documentation himself. This list is for the next assistant:
**ask the maintainer before doing any of them**, then mark each point (done / not wanted, with the date).

See also: [NOT-REQUESTED-2026-11-26.md](NOT-REQUESTED-2026-11-26.md) — things Claude did without being asked.

## On GitHub

| # | What is missing | Where | Who can do it | Done? |
|---|---|---|---|---|
| 1 | The **1.0.1 release text** has two wrong links and one wrong name: the Dashboard part links to *Projects* (should be the wiki page [Dashboard](https://github.com/GFGMNET/Workspace/wiki/Dashboard)), the built-in features part links to *Features* (should be [Built-in features](https://github.com/GFGMNET/Workspace/wiki/Built-in-features)), and it says **Help** where the menu says **Help & wiki**. The file `docs/releases/v1.0.1.md` is already correct. | GitHub → Releases → v1.0.1 → Edit | only the maintainer (release texts can't be edited from Claude's environment) — copy the text from `docs/releases/v1.0.1.md` | |
| 2 | The **0.6.3 release text** doesn't say that 0.x is deprecated (no more 0.x releases). Claude's attempt was refused. | GitHub → Releases → v0.6.3 → Edit | only the maintainer — if he wants it at all | |
| 3 | **No issues were opened** for the documentation gaps Claude found on 26 Nov (Dashboard page, Built-in features page, missing settings, wrong definition, …), although `CLAUDE.md` says every bug or improvement found becomes an issue. They are fixed now. | GitHub Issues | ask him whether he still wants issues for them (label `documentation`) | |

## In the app

| # | What is missing | Why | What to do | Done? |
|---|---|---|---|---|
| 4 | The **help inside the installed 1.0.1 app** doesn't have the documentation fixed after the release: the pages *Dashboard* and *Built-in features*, and the corrected pages (ComfyUI, Version Control, Ticket, Chat, Gallery, Issues, Projects, Features, FAQ, Getting Started). | The help pages are packed into the program when it is built (`build-rust.yml` copies `docs/wiki`). The wiki on GitHub is already correct. | They come with the next version (1.0.2) by themselves — nothing to do, unless he wants an earlier version for it. | |
| 5 | **No real screenshots** of the tabs and screens that came with 1.0.1: Dashboard, Version Control, ComfyUI, the six text layouts (journal, book, sticky notes, board, table, blog), Help & wiki, "Restore built-in features", "Use the new version", the MCP part of *Manage*, LM Studio in the chat. The wiki pages have text only. | The Rust app can't be built and run in Claude's environment, so it couldn't take pictures. The only pictures are the approved plan drawings in `docs/plans/img/`. | Take screenshots from the real app (on Windows or Linux), save them in `docs/screenshots/`, and add them to the wiki pages like the existing ones (`![Name](https://raw.githubusercontent.com/GFGMNET/Workspace/main/docs/screenshots/<file>.png)`). The help in the app shows them too. | |

## Documentation that was missing and is fixed now (for the record)

Fixed on 26 Nov 2026 after the maintainer pointed it out — nothing to do, but check the same kind of gap for every new feature:

- No wiki page for the **Dashboard**; no wiki page for **Built-in features** (restore / update / "Use the new version").
- The pages **ComfyUI**, **Version Control** and **Ticket** had no *Settings* list and no *The definition* part like the other feature pages.
- **Chat**: the definition on the page didn't match the real file.
- **Gallery**: videos and audio not mentioned. **Issues**: Forgejo settings missing in the list.
- **Projects**: the project settings `hide_tabs`, `programs`, `dashboard` not listed. **Features**: `engine`, `url`, `version`, board `columns`, icons missing.
- **FAQ** and **Getting Started**: nothing about the 1.0.1 features. Menu name written as "Help" instead of **Help & wiki**.
- **DESIGN.md**: wrong file name for the old version of a built-in feature (it is `<key>_deprecated.yaml`).

**Lesson for the next assistant:** for every new feature, check before the release that it has its own wiki page (with
*What you need*, how to switch it on, *Settings*, *The definition* if it is a built-in feature, *On disk*), that it is in
`_Sidebar.md` and `Home.md`, that the FAQ and Getting Started mention it, and that the release text links to that page.
