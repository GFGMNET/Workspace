# Layout & Design: the app's fixed look

**Rule:** the look of the app is **fixed**. The maintainer decides it, and the screenshots in `docs/screenshots/` and
`docs/plans/img/` show it. A new feature **adds** a screen with the existing parts below; it never changes the sidebar, the
tab row, the colours, the fonts, the spacing or any existing screen. If a plan's picture can't be built with the existing
parts, **stop and ask the maintainer** — don't invent a new design.

What happened before (2026-11-26): another model rebuilt the whole app layout while adding features. That is not allowed.
Changing `app.css` rules that already exist, `index.html`, the sidebar, the tab row or the theme counts as changing the layout.

## 1. Where the look lives

| File | What is in it | May you change it? |
|---|---|---|
| `app/public/index.html` | the frame: sidebar, main area, theme / layout buttons | **No** (only add a menu link if a plan says so) |
| `app/public/app.css` | all styles: colour tokens, every component | **Add** new rules at the end for a new screen, with a comment naming the plan; never change existing rules |
| `app/public/core.js` | helpers: `$`, `$$`, `esc`, `enc`, `api`, `toast`, `copy`, `icon`, `ICONS`, `md` (Markdown), `modal`, `confirmBox`, `fieldInput`, `readFields`, `fmtValue` | add a helper or an icon; don't change existing ones |
| `app/public/views.js` | one `VIEWS.<layout>` function per layout | add a new `VIEWS.<layout>`; don't change other views unless a plan says so |
| `app/public/app.js` | routing, home, project page, tabs, Manage, features, help, dashboard | change only the part a plan names |
| `app/public/explorer.js` | the Explorer | rarely |

No framework, no build step, no npm packages in the page. Mermaid and highlight.js are in `app/public/vendor/`.

## 2. Colours and fonts (tokens in `app.css` `:root`)

Always use these variables, never fixed colours. They switch for dark mode by themselves (`prefers-color-scheme` and
`html[data-theme=dark|light]`, toggle in the sidebar: Light → Dark → Auto).

| Token | Use |
|---|---|
| `--bg` | page background |
| `--panel`, `--panel2` | cards, panes, lists |
| `--ink`, `--ink2`, `--ink3` | text: normal, secondary, faint |
| `--line`, `--line2` | borders |
| `--accent`, `--accent-ink`, `--accent-soft`, `--accent-text` | primary buttons, active items, links |
| `--side`, `--side2`, `--side3`, `--side-ink`, `--side-ink2` | the dark sidebar only |
| `--ok`/`--ok-bg`, `--warn`/`--warn-bg`, `--err`/`--err-bg` | states and messages |
| `--code`, `--mark` | code background, search highlight |
| `--shadow` | card shadow |
| `--sans`, `--mono` | fonts (system fonts; base size 14px) |
| `--c1` … `--c8` | colours for avatars, chips, charts |

## 3. The parts to build with

| Class / helper | What it is | Example in the code |
|---|---|---|
| `.card` | white box with border and shadow; `h2` inside for a title | error cards, dashboard blocks |
| `.row` | flex row with gap; `.sp` is a spacer that pushes the rest right | every tool bar above a view |
| `.btn`, `.btn.sm`, `.btn.primary`, `.btn.ghost`, `.btn.danger` | buttons | **+ New**, Save, Delete |
| `.icon-btn` (with `.btn`) | button with only an icon | close, copy |
| `.seg` with `<button class="on">` | segmented switch (2–4 choices) | Issues: Open / Closed / All; Version Control: Files / History |
| `.chip`, `.chip.accent`, `.chip.ok`, `.chips` | small labels | labels, repository address, tags |
| `.split` → `.ilist` (left, sticky) + `.pane` (right, with `.bar` and `.body`) | list on the left, content on the right | pages, Version Control files |
| `.it`, `.it.active` | an entry in `.ilist` | page list, file tree |
| `.list-rows` → `.lrow` | rows in a card | History, list layout |
| `.empty` | centred grey text for "nothing here / loading" | every view while loading |
| `.note` | info bar | "Use the new version" |
| `.err`, `.warnbox` | error / warning text | a failed request |
| `.faint`, `.muted`, `.small`, `.mono` | text helpers | dates, paths |
| `pre.code` | code block | file content |
| `.md` | rendered Markdown (`md(text)`) | pages, help |
| `.tbl-wrap` + `table` | tables | contacts, markdown table |
| `.grid`, `.gal`, `.lb` | picture grid and lightbox | gallery, ComfyUI results |
| `.kanban`, `.kcol`, `.kcard` | columns with cards | tasks, board |
| `modal({title, body, ok, onOk})` | dialog | new item, restore features |
| `toast(text)` | short message at the bottom | "Saved" |
| `icon(name)` / `data-icon` + `fillIcons(el)` | icons from `ICONS` in `core.js` | everywhere |

Icons available (`ICONS`): audio eye book lightbulb image folder puzzle key plug chat kanban calendar users map diagram
contact server table list cards file layers search plus gear edit trash terminal copy upload pin chevl menu sun moon auto
laytop layleft issue github warn info stop.

## 4. How a view is built (pattern)

```js
VIEWS.mylayout = async ctx => {           // ctx: { p (project), f (feature: key, def), el (the tab body), sub, query, href(id, suffix) }
  ctx.el.innerHTML = `<div class="empty">Loading…</div>`;
  let d; try { d = await api(`/api/projects/${enc(ctx.p.slug)}/f/${enc(ctx.f.key)}/…`); }
  catch (e) { ctx.el.innerHTML = `<div class="card"><h2>${icon('warn')} …</h2><p class="muted">${esc(e.message)}</p></div>`; return; }
  ctx.el.innerHTML = `<div class="row" style="margin-bottom:12px">…tool bar…<span class="sp"></span><button class="btn sm">Refresh</button></div>
    <div class="split"><div class="ilist">…</div><div class="pane">…</div></div>`;
  fillIcons(ctx.el);
};
```

- Always `esc()` text from files or servers; `enc()` for URL parts.
- Navigation inside a tab: `location.hash = ctx.href(id, '?x=1')`; read it back with `ctx.query`.
- A layout is chosen by `layout:` in the feature file and must be listed for its store in `pw-core::workspace::layouts()`.
- Small inline styles (`margin`, `width`, `flex`) are fine for placing parts; new colours, borders or fonts are not.

## 5. The two app layouts

The user picks one with the button in the sidebar (kept in the browser, `pw-layout`):

- **Menu left** (default): dark sidebar left (projects, search, Help, Features, Secrets, theme), feature tabs on top.
- **Menu top** (`html.layout-top`): the sidebar becomes a top bar with a project drop-down; feature tabs become a list on the left.
- Below 900 px both use the phone menu. `tests/ui/layout.test.js` checks both in Chromium and WebKit.

A new screen must work in both and in light and dark mode. Look at it in both before you say it is done.

## 6. Pictures of the approved look

- `docs/screenshots/` — home, wiki, kanban, map, chat, features, diagram (dark), calendar, org chart, MCP.
- `docs/plans/img/` — the screens of each plan as the maintainer approved them (e.g. `vc-files.png`, `vc-history.png`,
  `comfyui-*.png`, `dashboard-edit.png`, the layout previews). Build to match these.

## 7. Checklist before you push a screen change

1. Only new code / new CSS rules at the end of `app.css`; no existing rule, colour or font changed.
2. Uses the parts in section 3 and the tokens in section 2.
3. Works in menu-left and menu-top, light and dark, and at phone width.
4. Text is escaped; nothing from a server goes into `innerHTML` unescaped.
5. `npm test` passes (it checks the screens' JavaScript syntax).
6. Docs: the wiki page of the feature has a short "Using it" part that matches the screen.
