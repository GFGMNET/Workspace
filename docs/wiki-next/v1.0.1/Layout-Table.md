# Layout: Table

For text features (`stores: markdown`). The pages as a table: title, tags, last changed, plus every field found at the top of the pages. Click a cell to change it — only that value changes. A page without a top part gets one when you fill a cell.

There is a search bar at the top (`search: false` hides it). Existing features don't change.

## Use it

In **Features** → a text feature → `layout: table`, or a new feature:

```yaml
name: My table
stores: markdown
layout: table
```

## What is kept in a page

A short block at the top of each page; the page stays normal text. The app writes it for you:

```markdown
---
author: Anna
date: 2026-11-18
---
# Logo story

How it came together.
```

See also: [[Features]] · [[Building Blocks|Building-Blocks]]
