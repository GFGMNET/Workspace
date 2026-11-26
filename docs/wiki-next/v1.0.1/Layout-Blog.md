# Layout: Blog

For text features (`stores: markdown`). Contents on the left (each page with its headings, levels 2 and 3 — a click jumps there), the pages one after another on the right, newest first (by `date:`).

There is a search bar at the top (`search: false` hides it). Existing features don't change.

## Use it

In **Features** → a text feature → `layout: blog`, or a new feature:

```yaml
name: My blog
stores: markdown
layout: blog
```

## What is kept in a page

A short block at the top of each page; the page stays normal text. The app writes it for you:

```markdown
---
date: 2026-11-24
tags: [howto]
---
# Backup in 3 steps

## Step 1 · What to save

Photos, documents …
```

See also: [[Features]] · [[Building Blocks|Building-Blocks]]
