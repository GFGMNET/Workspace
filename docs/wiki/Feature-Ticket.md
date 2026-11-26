# Ticket (GLPI)

The **Ticket** tab shows the tickets of your GLPI 11 server that belong to the project, and lets you work on them:
create a ticket (**+**, help text *New Ticket*), read it, edit its text, set its state, add follow-ups and a solution.
From version 1.0 (*Workspace*).

Above the list are four filters: **Open** (GLPI's *New* and *In progress*), **Pending**, **Closed** and **Solved**.
**Open** is chosen when you open the tab.

## What you need

- Version 1.0 (*Workspace*) or newer.
- A **GLPI 11** server that the PC can reach, with the REST API switched on.
- A GLPI **user token** and the **application token** of an API client, saved as secrets (see below).

**Which tickets belong to the project:** the tickets of the GLPI **category with the project's name**. If the category
doesn't exist yet, the app creates it. A category that is already used for other tickets shows those tickets too.

| | |
|---|---|
| Stores | `glpi` |
| Layout | `tickets` |
| Definition | `data/features/ticketsystem.yaml` |

## Set it up in a project

In the project's `project.yaml`:

```yaml
ticket:
  feature: ticketsystem
  url: https://glpi.example.com
  user: hermes
  user_token: ${secret:glpi-user-token}   # GLPI → your user → "API token"
  app_token: ${secret:glpi-app-token}     # GLPI → Setup → General → API → API client → "Application token"
```

Put both tokens into **Settings → Secrets** under these names. They are never written into the project folder.

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Tickets of a GLPI 11 server (plan: docs/plans/TICKETSYSTEM.md). Set it up in each project's project.yaml:
#   ticket:
#     feature: ticketsystem
#     url: https://glpi.example.com
#     user: hermes
#     user_token: ${secret:glpi-user-token}   # GLPI user API token, from Settings → Secrets
#     app_token: ${secret:glpi-app-token}     # app token of GLPI's API client, from Settings → Secrets
# The project's tickets are the tickets of the GLPI category with the project's name; it is created when missing.
# What GLPI needs (API client, rights): wiki page "Ticket".
name: Ticket
icon: issue
stores: glpi
layout: tickets
```

## Settings

Set per project, under the feature key in `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue, github, audio, key, layers | by layout |
| `aliases` | Other keys in project.yaml that mean this feature | none |
| `url` | The address of the GLPI server | **required** |
| `user` | The GLPI user name | **required** |
| `user_token` | The user's API token — as `${secret:name}` | **required** |
| `app_token` | The API client's application token — as `${secret:name}` | **required** |

## What GLPI needs

1. **Setup → General → API:** "Enable REST API" on.
2. **API client** (same page): active; its **IPv4 address range** must contain the address the requests come from — if
   GLPI is behind a reverse proxy or firewall, that is the proxy's address (or leave the range empty for all addresses).
   Copy its **Application token** into the secret `glpi-app-token`.
3. **The account's profile:** tickets (create, update, read), follow-ups and solutions (add), and **ITIL categories:
   create** (so the app can create the project's category).
4. **The user's API token:** GLPI → *your user* → *Remote access keys* → *API token* → secret `glpi-user-token`.

If something is missing, the tab shows GLPI's own message (e.g. "There isn't an active API client matching your IP
address", "missing parameter app_token", "You don't have permission to perform this action").

Plan and checks: `docs/plans/TICKETSYSTEM.md`.
