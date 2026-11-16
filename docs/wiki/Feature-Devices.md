# Devices

Network devices as a table — an example of a feature type you invent yourself. Copy it and change the fields for anything you want to keep a list of.

| | |
|---|---|
| Stores | `records` |
| Layout | `table` |
| Definition | `data/features/devices.yaml` |

## Add it to a project

```yaml
devices:
  - name: Router
    ip: 192.168.1.1
    kind: router
```

Or click **+ Feature** in the project's tab row.

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Example of a feature you invent yourself: network devices as a table.
name: Network devices
icon: server
stores: records
layout: table
fields:
  - name
  - ip
  - mac
  - location
  - name: kind
    type: select
    options: [router, switch, server, access point, printer, other]
  - notes
new_item: Device
```

## Settings

Every setting can also be set **for one project only**, under the feature key in that project's `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue | by layout |
| `folder` | Folder inside the project where the content goes | the key |
| `search` | Show the search box | true |
| `new_item` | Label of the **+ New** button | Device |
| `aliases` | Other keys in project.yaml that mean this feature | none |
| `fields` | The columns | name, ip, mac, location, kind, notes |

## Fields

Each record is a small YAML file with the fields of the feature:

```yaml
name: Router
ip: 192.168.1.1
mac: 00:11:22:33:44:55
location: Hallway
kind: router
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
projects/<project>/devices/
  router.yaml
```

## Tips

- Link tasks to devices with a `link` field (`to: devices`), and use `[[Router]]` in wiki pages.

See also: [[Features]] · [[Building Blocks|Building-Blocks]] · [[Projects]]
