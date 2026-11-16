# Map

An offline map: upload your own picture — a floor plan, site plan or any map — and place pins on it. Pins can be dragged; no internet needed.

![Map](https://raw.githubusercontent.com/GFGMNET/Workspace/main/docs/screenshots/map.png)

| | |
|---|---|
| Stores | `records` |
| Layout | `map` |
| Definition | `data/features/map.yaml` |

## Add it to a project

```yaml
map:
  - name: Router
    kind: device
```

Or click **+ Feature** in the project's tab row.

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Offline map: upload your own image (floor plan, site plan) and place pins on it.
name: Map
icon: map
stores: records
layout: map
fields:
  - name
  - name: kind
    type: select
    options: [device, room, site, other]
  - notes
new_item: Pin
```

## Settings

Every setting can also be set **for one project only**, under the feature key in that project's `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue | by layout |
| `folder` | Folder inside the project where the content goes | the key |
| `search` | Show the search box | true |
| `new_item` | Label of the **+ New** button | Pin |
| `aliases` | Other keys in project.yaml that mean this feature | none |
| `fields` | The pin's fields (the position `x`/`y` is added by the app) | name, kind, notes |

## Fields

Each record is a small YAML file with the fields of the feature:

```yaml
name: Router
kind: device
x: 14       # % from the left of the picture
y: 80       # % from the top
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

**Upload map image** stores the picture as `_map.png` (or `.jpg`, `.svg` …) in the feature folder. **Add pin**, then click on the map; pins without a position are listed as *not placed*.

## On disk

```
projects/<project>/map/
  _map.svg
  router.yaml
```

## Tips

- Several maps in one project: use several keys, e.g. `ground_floor: { feature: map }` and `first_floor: { feature: map }`.

See also: [[Features]] · [[Building Blocks|Building-Blocks]] · [[Projects]]
