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

## Three ways to add one

1. **In the app:** **Features → + New feature**. Pick what it stores, the layout and the fields.
2. **By hand:** copy a file in `data/features/` and change it.
3. **With Claude:** "add a feature *Contacts* with name, phone and company as a table".

## All settings

| Setting | Values | Default |
|---|---|---|
| `name` | display name | the key |
| `icon` | book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal | by layout |
| `stores` | `markdown`, `images`, `files`, `records`, `diagram`, `chat`, `github` | `markdown` |
| `repo` | github: `owner/name` of the repository | none |
| `layout` | markdown → `pages`, `cards`, `list` · records → `table`, `list`, `cards`, `kanban`, `calendar`, `orgchart`, `map` · images → `grid` · files → `files`, `code` · diagram → `diagram` · chat → `chat` · github → `issues` | first one |
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

wiki · knowledge · gallery · files · scripts · skills · mcp · chat · tasks · calendar · team · map · diagrams · contacts · devices · github (issues)

New versions can bring new starter features; they are added once. Features you changed or deleted are never touched.
