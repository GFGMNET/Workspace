# Contacts

A simple, sortable and searchable table of contacts. Click a row to edit it.

## What you need

- Nothing extra: works offline, contacts are files in the project.

| | |
|---|---|
| Stores | `records` |
| Layout | `table` |
| Definition | `data/features/contacts.yaml` |

## Add it to a project

```yaml
contacts:
  - name: Movers GmbH
    phone: +49 30 1234
```

Or click **+ Feature** in the project's tab row.

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Simple table of contacts.
name: Contacts
icon: contact
stores: records
layout: table
fields:
  - name
  - company
  - phone
  - email
  - notes
new_item: Contact
```

## Settings

Every setting can also be set **for one project only**, under the feature key in that project's `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue | by layout |
| `folder` | Folder inside the project where the content goes | the key |
| `search` | Show the search box | true |
| `new_item` | Label of the **+ New** button | Contact |
| `aliases` | Other keys in project.yaml that mean this feature | none |
| `layout` | `table`, `list` or `cards` | `table` |
| `fields` | The columns | name, company, phone, email, notes |

## Fields

Each record is a small YAML file with the fields of the feature:

```yaml
name: Movers GmbH
company: Movers GmbH
phone: +49 30 1234
email: info@movers.example
```

| Type | Input | Notes |
|---|---|---|
| `text` | one line | default |
| `longtext` | several lines | not shown in tables |
| `number` | number | stored as a number |
| `date` / `datetime` | date picker | `2026-11-20`; used by calendar, overview *coming up* |
| `select` | drop-down | needs `options: [a, b, c]` |
| `bool` | tick box | shown as ✓ |
| `url` / `email` | link | clickable |
| `tags` | comma separated | stored as a list |
| `list` | one per line | stored as a list |
| `keyvalue` | `KEY=value` per line | stored as a map (e.g. environment variables) |
| `link` | type-ahead picker | points to pages/records in the project; `to: <feature>` limits it, `multiple: true` allows several |

Without `type:` the type is guessed from the name: `due`, `date`, `start`, `end` → date · `email` → email · `url`, `link`, `website` → url · `notes`, `description` → long text · `tags` → tags · `done`, `active` → bool.

## On disk

```
projects/<project>/contacts/
  movers-gmbh.yaml
```

See also: [[Features]] · [[Building Blocks|Building-Blocks]] · [[Projects]]
