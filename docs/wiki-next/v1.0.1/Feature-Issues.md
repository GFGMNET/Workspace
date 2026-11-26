# Issues

The issues of a repository — bugs and ideas — with open/closed/all, label filters, search and the full text when you click one. **New issue** and **Issues** open the repository's website.

Works with **github.com** and with your own **Forgejo** server (see *Forgejo* below). Not with GitHub Enterprise Server or other bug trackers.

## What you need

- An internet connection.
- A repository on github.com. Public repositories need nothing else.
- For a **private** repository: a GitHub token, saved as a secret (see *Private repositories* below).

| | |
|---|---|
| Feature | `issue` (older projects say `github_issue` or `github` — that still works) |
| Stores | `github` |
| Layout | `issues` |
| Definition | `data/features/issue.yaml` |

## Add it to a project

The easiest way: click **+ Feature** in the project's tab row and choose **Issues**.

Or write it into the project's `project.yaml`:

```yaml
issue:                     # the name of the tab — "issue" needs nothing more
  repo: GFGMNET/Workspace  # owner/name of the repository
```

| Line | What to write |
|---|---|
| `issue:` | The feature. With this name nothing else is needed. Want another tab name, e.g. `bugs:`? Then add the line `feature: issue` below it. |
| `repo:` | The repository as **owner/name** — the part after `github.com/` in the browser. For `https://github.com/GFGMNET/Workspace` that is `GFGMNET/Workspace`. Upper or lower case doesn't matter, and you can also paste the whole address. |

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Issues of a repository (bugs and ideas): GitHub online (github.com) or your own Forgejo server
# (engine: forgejo, url:, token: — docs/plans/FORGEJO.md). Set the repository in each project:
#   issue: { repo: owner/name }
# Private repositories need a token in data/settings.yaml:  github: { token: ... }
# Older projects that say "feature: github_issue" or "feature: github" still work (aliases).
name: Issues
icon: issue
stores: github
layout: issues
state: open
aliases: [github_issue, github]
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

## Forgejo

For a repository on your own [Forgejo](https://forgejo.org/) server (on this PC or in your network):

```yaml
issue:
  engine: forgejo
  url: https://192.168.1.20:3000     # the address of the Forgejo server
  repo: team/app                     # owner/name on that server
  token: ${secret:forgejo-token}     # only for private repositories
```

The token is made in Forgejo under *Settings → Applications* (read access to issues is enough) and saved under **Secrets**. Self-made certificates on your own server are accepted. Pull requests are not shown.

## Tips

- Nothing is stored in the project: the issues are read from GitHub or Forgejo.

See also: [[Features]] · [[Building Blocks|Building-Blocks]] · [[Projects]]
