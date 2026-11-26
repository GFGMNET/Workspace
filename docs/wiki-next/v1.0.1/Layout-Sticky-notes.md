# Layout: Sticky notes

For text features (`stores: markdown`). Notes in a grid, each with a color — yellow, green, blue, pink, orange or grey. Click the dots to change the color; a click on the note opens the full page.

There is a search bar at the top (`search: false` hides it). Existing features don't change.

## Use it

In **Features** → a text feature → `layout: notes`, or a new feature:

```yaml
name: My sticky notes
stores: markdown
layout: notes
```

## What is kept in a page

A short block at the top of each page; the page stays normal text. The app writes it for you:

```markdown
---
color: green
---
# Call Anna

Before Friday.
```

See also: [[Features]] · [[Building Blocks|Building-Blocks]]
