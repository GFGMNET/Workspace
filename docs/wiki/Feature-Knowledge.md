# Knowledge

Reference articles shown as **cards** with a short summary and tags, plus search and a tag filter. Click a card to read or edit the article.

## What you need

- Nothing extra: works offline, articles are Markdown files in the project.

| | |
|---|---|
| Stores | `markdown` |
| Layout | `cards` |
| Definition | `data/features/knowledge.yaml` |

## Add it to a project

```yaml
knowledge:
  - VPN setup
  - Backup plan
```

Or click **+ Feature** in the project's tab row.

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Knowledge base: articles shown as cards, with tags and search.
# Tags come from the front matter of each page:  ---\ntags: [network, setup]\n---
name: Knowledge
icon: lightbulb
stores: markdown
layout: cards
search: true
new_item: Article
aliases: [knowlege, kb, knowledge_base]   # other keys that mean the same feature
```

## Settings

Every setting can also be set **for one project only**, under the feature key in that project's `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue | by layout |
| `folder` | Folder inside the project where the content goes | the key |
| `search` | Show the search box | true |
| `new_item` | Label of the **+ New** button | Article |
| `aliases` | Other keys in project.yaml that mean this feature | none |
| `layout` | `cards`, `pages` or `list` | `cards` |

## Writing articles

- Pages are Markdown (`.md`). The first `# Heading` is the title.
- **Front matter** (optional, at the very top) adds information:
  ```markdown
  ---
  title: VPN setup
  tags: [network, setup]
  description: Short summary shown on cards
  ---
  ```
- **Links:** `[[Page title]]` links to any page or record of the project; `[[devices/router]]` to an exact item; a link to a page that doesn't exist yet creates it.
- **Pictures:** paste (Ctrl+V) or drop them into the editor. They are saved in `assets/` next to the page.
- **Diagrams** inside a page: a ` ```mermaid ` code block.
- Every page shows **Mentioned in**: the pages and records that link to it.

The **tags** in the front matter become the filter buttons above the cards.

## On disk

```
projects/<project>/knowledge/
  vpn-setup.md
  backup-plan.md
```

## Tips

- Also accepts the keys `knowlege`, `kb` and `knowledge_base` (aliases).

See also: [[Features]] · [[Building Blocks|Building-Blocks]] · [[Projects]]
