# Layout: Journal

For text features (`stores: markdown`). Several entries per day, grouped by year and month, newest first. **New** creates an entry with today's date and time.

There is a search bar at the top (`search: false` hides it). Existing features don't change.

## Use it

In **Features** → a text feature → `layout: journal`, or a new feature:

```yaml
name: My journal
stores: markdown
layout: journal
```

## What is kept in a page

A short block at the top of each page; the page stays normal text. The app writes it for you:

```markdown
---
date: 2026-11-24
time: "08:15"
---
# Morning

Coffee on the balcony, then the backup.
```

See also: [[Features]] · [[Building Blocks|Building-Blocks]]
