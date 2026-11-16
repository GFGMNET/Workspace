# Issues

The issues of a GitHub repository — bugs and ideas — with open/closed/all, label filters, search and the full text when you click one. **New issue** and **On GitHub** open GitHub.

| | |
|---|---|
| Stores | `github` |
| Layout | `issues` |
| Definition | `data/features/github.yaml` |

## Add it to a project

```yaml
issues:
  feature: github
  repo: GFGMNET/Workspace
```

Or click **+ Feature** in the project's tab row.

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Issues of a GitHub repository (bugs and ideas). Set the repository in each project:
#   issues: { feature: github, repo: owner/name }
# Private repositories need a token in data/settings.yaml:  github: { token: ... }
name: Issues
icon: issue
stores: github
layout: issues
state: open
```

## Settings

Every setting can also be set **for one project only**, under the feature key in that project's `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue | by layout |
| `folder` | Folder inside the project where the content goes | the key |
| `search` | Show the search box | true |
| `new_item` | Label of the **+ New** button | Issue |
| `aliases` | Other keys in project.yaml that mean this feature | none |
| `repo` | The repository, `owner/name` | **required** |
| `state` | What to show first: `open`, `closed` or `all` | `open` |

## Private repositories

Public repositories need no login. For a private one (or a higher rate limit) add a GitHub token to `data/settings.yaml`:

```yaml
github:
  token: ghp_...
```

or set the `GITHUB_TOKEN` environment variable. Results are cached for 5 minutes; **Refresh** reloads.

## Tips

- Nothing is stored in the project: the issues are read from GitHub.

See also: [[Features]] · [[Building Blocks|Building-Blocks]] · [[Projects]]
