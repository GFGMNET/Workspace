# Features

A feature is one YAML file in `data/features/` that says **what it stores** and **how it looks**. Every project that names it gets the same behaviour, and changing the file changes it everywhere.

```yaml
# Kanban board for tasks        ← the first comment is shown as the description
name: Tasks
icon: kanban
stores: records
layout: kanban
columns: [To do, Doing, Done]
fields:
  - title
  - owner
  - name: due
    type: date
  - name: priority
    type: select
    options: [low, normal, high]
  - name: related
    type: link
    multiple: true
new_item: Task
```

## Feature reference

Every starter feature has its own page with all its settings, examples and what it stores on disk:

| Feature | Layout | Page |
|---|---|---|
| Wiki | pages | [[Feature-Wiki]] |
| Knowledge | cards | [[Feature-Knowledge]] |
| Gallery | grid | [[Feature-Gallery]] |
| Files | files | [[Feature-Files]] |
| Scripts | code | [[Feature-Scripts]] |
| Skills | pages (for Claude) | [[Feature-Skills]] |
| MCP | cards (for Claude) | [[Feature-MCP]] |
| Chat | chat | [[Feature-Chat]] |
| Tasks | kanban | [[Feature-Tasks]] |
| Calendar | calendar | [[Feature-Calendar]] |
| Team | org chart | [[Feature-Team]] |
| Map | map | [[Feature-Map]] |
| Diagrams | diagram | [[Feature-Diagrams]] |
| Contacts | table | [[Feature-Contacts]] |
| Devices | table | [[Feature-Devices]] |
| Issues (`issue`) | issues (github.com; Forgejo from 1.0.2) | [[Feature-Issues]] |
| Ticket (`ticketsystem`) | tickets (GLPI 11) | [[Feature-Ticket]] |

## Three ways to add one

1. **In the app:** **Features → + New feature**. Pick what it stores, the layout and the fields.
2. **By hand:** copy a file in `data/features/` and change it.
3. **With Claude:** "add a feature *Contacts* with name, phone and company as a table".

## Make your own feature, step by step

Example: a **Customers** list with name, phone, company and the date of the last call.

1. Open **Features** in the menu → **+ New feature**.
2. **Name:** `Customers`. The key becomes `customers` (small letters, digits and `_`).
3. **What it stores:** *records* (one entry per customer). **Layout:** *table*.
4. **Fields:** `name`, `phone`, `company`, `last_call` (type *date*). Save.
5. Open a project → **+** in the tab row → choose **Customers**. The tab is there; **+ New** adds a customer.

The same as a file — `data/features/customers.yaml`:

```yaml
# Our customers
name: Customers
icon: contact
stores: records
layout: table
fields:
  - name
  - phone
  - company
  - name: last_call
    type: date
new_item: Customer
```

**Per project** you can change any setting in `project.yaml` without touching the feature, e.g. other kanban columns
in one project:

```yaml
tasks:
  columns: [Backlog, This week, Done]
```

## What a feature can't do (limits)

- **Only the built-in building blocks.** A feature chooses one kind of storage (`stores`) and one layout from the list
  below. It can't bring its own screen or program code.
- **No connections to other programs or services.** A feature you make yourself only works with the files in the
  project. It can't connect to Home Assistant, a database, a shop or any other service. Only the connections built into
  the app talk to other servers: **Issues** (GitHub; Forgejo from 1.0.2) and **Ticket** (GLPI) — later also ComfyUI.
  A new connection needs a new version of the app.
- **Layout and storage must fit together** (e.g. *kanban* only with *records*). The app refuses a wrong combination and
  says which layouts fit.
- **Only the listed field types.** No formulas, no calculated fields, no sums.
- **Links** (`type: link`) only point to pages and entries **in the same project**.
- **Icons:** only the ones in the list below.
- **Some names are taken** by the project's own settings and can't be tab names: `name`, `description`, `icon`, `color`,
  `tags`, `status`, `owner`, `created`, `overview`, `location`, `hide_tabs`.
- **One definition for all projects.** Changing the feature file changes it in every project that uses it (per-project
  changes go into `project.yaml`, see above).
- **A feature that a project still uses can't be deleted** — the app says which projects use it.
- **Issues and Ticket need their server** (GitHub / GLPI) and the network; all other features work offline.
- **One person at a time:** everything is files; don't edit the same project on two computers at the same moment.

## All settings

| Setting | Values | Default |
|---|---|---|
| `name` | display name | the key |
| `icon` | book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal | by layout |
| `stores` | `markdown`, `images`, `files`, `records`, `diagram`, `chat`, `github`, `glpi` | `markdown` |
| `repo` | github: `owner/name` of the repository | none |
| `layout` | markdown → `pages`, `cards`, `list` · records → `table`, `list`, `cards`, `kanban`, `calendar`, `orgchart`, `map` · images → `grid` · files → `files`, `code` · diagram → `diagram` · chat → `chat` · github → `issues` · glpi → `tickets` | first one |
| `folder` | where the content goes in a project | the key |
| `search` | `true` / `false` | true for text and records |
| `new_item` | label of the **+ New** button | by store |
| `aliases` | other keys that mean this feature | none |
| `fields` | records: list of `name` or `{name, type, label, options, to, multiple}` | `[title]` |
| `title_field` | records: which field is the title | first field |
| `columns`, `status_field` | kanban | `[To do, Doing, Done]`, `status` |
| `date_field`, `end_field` | calendar | first date field, `end` |
| `parent_field` | org chart | `reports_to` |
| `albums` | images: sub folders as albums | `true` |
| `for_claude` | `skills` or `mcp` | none |
| `permissions` | chat: `ask`, `auto`, `read-only` | `ask` |
| `allowed_tools`, `context`, `instructions`, `model` | chat details | none |

**Field types:** `text`, `longtext`, `number`, `date`, `datetime`, `select` (with `options`), `bool`, `url`, `email`, `tags`, `list`, `keyvalue`, `link` (with optional `to: <feature>` and `multiple: true`). Without a type, it is guessed from the name: `due` becomes a date, `email` an email, `notes` a long text.

## Starter features

wiki · knowledge · gallery · files · scripts · skills · mcp · chat · tasks · calendar · team · map · diagrams · contacts · devices · issue (Issues) · ticketsystem (GLPI)

New versions can bring new starter features; they are added once. Features you changed or deleted are never touched.
