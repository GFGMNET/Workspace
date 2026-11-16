# Plan: feature "ticketsystem" (GLPI, osTicket)

Status: **planned** · Issue #59 · [REQUIREMENTS.md](../REQUIREMENTS.md) B17

## 1. Goal

A project shows the tickets that belong to it from the company's ticket system, without switching tools:
open tickets, their history, what is due, and (later) answering or closing them from the workspace.
Claude can read them too ("summarise the open tickets of this customer").

Supported systems: **GLPI** (full) and **osTicket** (limited by its API, see §4).

## 2. How it looks for the user

```yaml
# data/projects/customer-x/project.yaml
tickets:
  feature: ticketsystem
  system: glpi                    # glpi | osticket
  url: https://glpi.example.com   # the server
  filter:                         # which tickets belong to this project
    entity: Customer X            # GLPI entity, and/or
    category: Network             # category, group, assigned to me, tag …
    status: open                  # open | all | closed
```

```yaml
# data/settings.yaml — the login, once per server (values via Secrets, never as text)
ticketsystems:
  glpi.example.com:
    client_id: ${secret:glpi-client-id}
    client_secret: ${secret:glpi-client-secret}
    username: anna
    password: ${secret:glpi-password}
```

The **Tickets** tab:

- a list with number, title, status, priority, requester, assigned to, last change; search and filters (status, assigned to me, category);
- a ticket opened on the right: description, follow-ups, tasks, solution, attachments (download), and *Open in GLPI*;
- a board by status (like Kanban), read-only at first;
- the project's **Overview** and the home page's **Coming up in all projects** show tickets that are due (GLPI's *time to resolve*), and the desktop app reminds you of them;
- links: `[[ticket:1234]]` in a wiki page links to the ticket, and the ticket shows *Mentioned in*.

## 3. GLPI

GLPI has two APIs; the feature supports both, chosen automatically:

| | API v2 (GLPI 11 and newer) | Legacy API v1 (GLPI 9.5–10, still in 11) |
|---|---|---|
| Address | `/api.php/v2/…` | `/apirest.php/…` (in 11 also `/api.php/v1`) |
| Login | OAuth2: *password* grant with a client registered under *Setup → OAuth clients* (client id + secret) and a user | `App-Token` + the user's personal `user_token` → `initSession` → `Session-Token` |
| Tickets | `Assistance/Ticket` (list, get, create, update), timeline (follow-ups, tasks, solutions) | `Ticket`, `Ticket/<id>/ITILFollowup`, `search/Ticket` |

**Phase A (read):** list with filters, ticket details with follow-ups/tasks/solution, due dates, attachments.
**Phase B (write):** create a ticket, add a follow-up (public or private), change status, assign to me, add a solution, attach a file. Each write shows what will be sent and needs a click; Claude may only write when the project's chat permissions allow it.

## 4. osTicket

The official osTicket API can **only create tickets** (`POST /api/tickets.json`, `X-API-Key` header). Each API key is bound to one IP address, so it only works from a PC with a fixed address (or through a server).

| What | How |
|---|---|
| **Create a ticket** from the workspace | official API: works out of the box |
| **Read tickets** (list, details) | needs an extension on the osTicket server: a community REST API plugin. Without it, osTicket can't be read through a supported interface. |
| *Not planned* | reading osTicket's database directly: it bypasses osTicket's permissions and breaks with updates |

So for osTicket: phase A = *New ticket* + a link to the osTicket staff panel; phase C = reading, **if** a plugin can be installed on your osTicket server.

## 5. How it is built

- New storage type `tickets` with layout `tickets` (like the GitHub *issues* feature: nothing is stored in the project folder).
- `app/lib/tickets/` with one provider per system: `glpi.js` (v1 and v2), `osticket.js`. Same interface: `list(filter)`, `get(id)`, later `create`, `followup`, `setStatus`.
- Logins come from `settings.yaml` + [Secrets](../wiki/Secrets.md); sessions/tokens are kept in memory only and renewed automatically.
- Results are cached for 2 minutes in memory (**Refresh** reloads). Ticket contents are **not** written to disk: they can contain personal data.
- API: `GET /api/projects/<p>/f/<f>/tickets?…`, `GET …/tickets/<id>`, later `POST …/tickets`, `POST …/tickets/<id>/followups`, `PATCH …/tickets/<id>`.
- MCP server: `list_tickets`, `read_ticket` (later `add_followup` with confirmation in the app).
- Only HTTPS servers (or `localhost`); self-signed certificates can be allowed per server (`ca:` file).
- Version 1.0 (Rust): the providers move to `pw-server` like the GitHub feature; the contract tests (phase 0 of the migration) include the tickets API with a fake GLPI.

## 6. Testing

- A fake GLPI (v1 and v2) and osTicket in the automated tests.
- On GitHub runners: the official GLPI and osTicket Docker images, checked once per release.
- By hand: against your own GLPI / osTicket.

## 7. Phases and effort

| Phase | What | Days |
|---|---|---|
| A | GLPI read (v2 + v1), list, details, filters, due dates, links, MCP read tools | 4–5 |
| A | osTicket: *New ticket* (official API) | 1 |
| B | GLPI write: new ticket, follow-up, status, assign, solution, attachment | 3–4 |
| C | osTicket read, if a REST plugin is available on the server | 2–3 |

## 8. Questions

1. Which **GLPI version** do you run (10 or 11)? It decides v1 or v2 first.
2. **osTicket version**, and can a plugin be installed on that server?
3. How do tickets belong to a project: by **entity** (customer), **category**, **group**, or a **tag**?
4. Read first (phase A) and write later, or both right away?
5. Build in 0.x now, or only in 1.0 (Rust)? *Proposal: now, small and covered by the contract tests, so the Rust port is mechanical.*
