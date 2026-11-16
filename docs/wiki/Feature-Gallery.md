# Gallery

Pictures in albums. Albums are shown as cards with a cover, the number of pictures and their date range; pictures open in a full-screen viewer.

| | |
|---|---|
| Stores | `images` |
| Layout | `grid` |
| Definition | `data/features/gallery.yaml` |

## Add it to a project

```yaml
gallery:
  - Holiday 2025     # an album (folder), created once
  - Office move
```

Or click **+ Feature** in the project's tab row.

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Picture gallery with albums (one sub folder per album).
name: Gallery
icon: image
stores: images
layout: grid
albums: true
new_item: Album
```

## Settings

Every setting can also be set **for one project only**, under the feature key in that project's `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue | by layout |
| `folder` | Folder inside the project where the content goes | the key |
| `search` | Show the search box | false |
| `new_item` | Label of the **+ New** button | Album |
| `aliases` | Other keys in project.yaml that mean this feature | none |
| `albums` | Sub folders are albums | `true` |

## Sorting and grouping

- **Sort:** newest first, oldest first, name A–Z / Z–A, largest first
- **Group:** by album, month or year (tick **All albums** to see every picture at once)
- The date is the photo's *date taken* from the camera (EXIF in JPEG files), otherwise the file date.
- Sort and grouping are remembered per gallery.

## Adding pictures

**Add pictures**, drag & drop onto the page, or copy files straight into the folder: the gallery shows them right away. In the viewer: ← → to browse, **Del** moves the picture to `.trash`.

## On disk

```
projects/<project>/gallery/
  holiday-2025/
    beach.jpg
    sunset.jpg
  office-move/
    boxes.jpg
```

## Tips

- PNG, JPEG, GIF, WebP, SVG, BMP and AVIF are shown.

See also: [[Features]] · [[Building Blocks|Building-Blocks]] · [[Projects]]
