# GitHub issues

The issues of a repository on **github.com** — bugs and ideas — with open/closed/all, label filters, search and the full text when you click one. **New issue** and **On GitHub** open GitHub.

**For GitHub online only** (github.com). It does not work with GitHub Enterprise Server or with other bug trackers.

## What you need

- An internet connection.
- A repository on github.com. Public repositories need nothing else.
- For a **private** repository: a GitHub token, saved as a secret (see *Private repositories* below).

| | |
|---|---|
| Feature | `github_issue` (older projects say `github` — that still works) |
| Stores | `github` |
| Layout | `issues` |
| Definition | `data/features/github_issue.yaml` |

## Add it to a project

The easiest way: click **+ Feature** in the project's tab row and choose **GitHub issues**.

Or write it into the project's `project.yaml`:

```yaml
issues:                    # the name of the tab — any name you like, e.g. bugs:
  feature: github_issue    # always exactly this: which feature the tab uses
  repo: GFGMNET/Workspace  # owner/name of the repository
```

| Line | What to write |
|---|---|
| `issues:` | Your own name for the tab. Any word, e.g. `bugs:` or `tickets:`. |
| `feature: github_issue` | Always exactly `github_issue`. |
| `repo:` | The repository as **owner/name** — the part after `github.com/` in the browser. For `https://github.com/GFGMNET/Workspace` that is `GFGMNET/Workspace`. Upper or lower case doesn't matter, and you can also paste the whole address. |

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Issues of a repository on github.com (GitHub online only — not GitHub Enterprise Server and not other
# bug trackers). Set the repository in each project:
#   issues: { feature: github_issue, repo: owner/name }
# Private repositories need a token in data/settings.yaml:  github: { token: ... }
# Older projects that say "feature: github" still work (alias).
name: GitHub issues
icon: issue
stores: github
layout: issues
state: open
aliases: [github]
```

## Settings

Every setting can also be set **for one project only**, under the feature key in that project's `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue | by layout |
| `folder` | Folder inside the project where the content goes | the key |
| `search` | Show the search box | true |
| `aliases` | Other keys in project.yaml that mean this feature | none |
| `repo` | The repository, `owner/name` (or its whole github.com address) | **required** |
| `state` | What to show first: `open`, `closed` or `all` | `open` |

## Private repositories

Public repositories need no login. For a private one (or a higher rate limit) save a GitHub token under **Secrets** (e.g. as `github-token`) and refer to it in `data/settings.yaml`:

```yaml
github:
  token: ${secret:github-token}
```

A token written directly (`token: ghp_...`) works too, but stays readable in the file. See [[Secrets]].

or set the `GITHUB_TOKEN` environment variable. Results are cached for 5 minutes; **Refresh** reloads.

## Tips

- Nothing is stored in the project: the issues are read from GitHub.

See also: [[Features]] · [[Building Blocks|Building-Blocks]] · [[Projects]]
