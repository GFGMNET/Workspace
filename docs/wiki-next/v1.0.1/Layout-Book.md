# Layout: Book

For text features (`stores: markdown`). Like an ebook: the contents on the left (**☰ Contents** hides them), one page in the middle, **A− / A+** for the text size (remembered), previous / next, *Page x of y*, and **⛶** for full screen. Drag a page in the contents to change the order — or into another chapter.

There is a search bar at the top (`search: false` hides it). Existing features don't change.

## Use it

In **Features** → a text feature → `layout: book`, or a new feature:

```yaml
name: My book
stores: markdown
layout: book
```

## What is kept in a page

A short block at the top of each page; the page stays normal text. The app writes it for you:

```markdown
---
chapter: Soups
order: 2
---
# Tomato soup

Grandma's recipe, best in late summer.
```

See also: [[Features]] · [[Building Blocks|Building-Blocks]]
