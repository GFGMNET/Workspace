# Dashboard

Every project has its own dashboard at the top of its **Overview** tab. A dashboard is made of blocks. Each block shows one
part of the project — for example the open issues, the tasks of one person, the pages with a tag — as a **number** or as a
**list**.

## What you need

Nothing. New and existing projects start with an empty dashboard.

## Make your dashboard

1. Open the project and its **Overview** tab.
2. Click **Edit** (top right of the dashboard).
3. Click **Add block** and fill in:

   | Field | What to choose |
   |---|---|
   | **What** | a feature of the project, e.g. *Tasks*, *Issues*, *Ticket*, *Wiki* |
   | **Show as** | **Number** (how many there are) or **List** (the entries, each one is a link) |
   | **Filter** | optional — see *Filters* below |
   | **How many (lists)** | how many entries a list shows (1–50, default 5) |

4. Arrange the blocks:
   - **Move:** drag a block onto another one.
   - **Size:** drag the block's bottom-right corner. The grid is 4 blocks wide; a block is 1–4 wide and 1–3 high.
   - **Remove:** the **✕** on the block.
5. Click **Save**. **Cancel** throws away the changes.

Click a number to open that feature's tab; click an entry in a list to open it.

## Filters

| Write | Shows |
|---|---|
| nothing | everything of that feature |
| a word, e.g. `open` | entries where any field contains that word |
| `field = value`, e.g. `label = bug`, `status = Doing`, `owner = Anna` | entries where that field has that value |
| `field != value`, e.g. `state != closed` | entries where that field does **not** have that value |

Upper or lower case doesn't matter. The fields are the ones of the feature: for tasks and other records their fields
(`status`, `owner`, …), for pages the values at the top of the page and `tags`, for Issues `state`, `label` and `title`,
for Ticket `status`, `state` and `title`.

## Where it is saved

In the project's `project.yaml`, under `dashboard:` — one entry per block. You can also write it by hand:

```yaml
dashboard:
  - what: issue         # the key of a feature in this project
    show: number        # number | list
    filter: label = bug
    x: 0                # place in the grid (0–3)
    y: 0
    w: 1                # 1–4 wide
    h: 1                # 1–3 high
  - what: tasks
    show: list
    filter: status = Doing
    count: 5            # how many entries, for lists
    x: 1
    y: 0
    w: 2
    h: 2
```

## Good to know

- `dashboard` is a setting of the project, not a feature. A feature of your own called `dashboard` can't be a tab any more —
  rename it (its key in `project.yaml` and its file in `data/features/`).
- `overview: false` in `project.yaml` still hides the whole Overview tab, dashboard included.
- Issues and Ticket blocks need their server (GitHub or Forgejo / GLPI) to show their numbers.

See also: [[Projects]] · [[Building Blocks|Building-Blocks]]
