# Ticket (GLPI)

The **Ticket** tab shows the tickets of your GLPI 11 server that belong to the project, and lets you work on them:
create a ticket (**+**, help text *New Ticket*), read it, edit its text, set its state, add follow-ups and a solution.
From version 1.0 (*Workspace*).

## What you need

- Version 1.0 (*Workspace*) or newer.
- A **GLPI 11** server that the PC can reach, with the REST API switched on.
- A GLPI **user token** and the **application token** of an API client, saved as secrets (see below).

**Which tickets belong to the project:** the tickets of the GLPI **category with the project's name**. If the category
doesn't exist yet, the app creates it. A category that is already used for other tickets shows those tickets too.

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
