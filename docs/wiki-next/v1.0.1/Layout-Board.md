# Layout: Board

For text features (`stores: markdown`). Kanban for text pages: drag a card into another column — only its `status:` line changes. Columns come from `columns:` in the feature file; without it they are *Idea / In progress / Done*. A page without a column is in the first one.

There is a search bar at the top (`search: false` hides it). Existing features don't change.

## Use it

In **Features** → a text feature → `layout: board`, or a new feature:

```yaml
name: My board
stores: markdown
layout: board
columns: [Idea, In progress, Done]   # optional, only for board
```

## What is kept in a page

A short block at the top of each page; the page stays normal text. The app writes it for you:

```markdown
---
status: In progress
---
# Backup in 3 steps

Step 1 …
```

See also: [[Features]] · [[Building Blocks|Building-Blocks]]
