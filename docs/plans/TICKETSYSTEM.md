# Plan: feature "ticketsystem" (GLPI)

Status: **planned for v1.1 (Rust)** · Issue #59 · [REQUIREMENTS.md](../REQUIREMENTS.md) B17

## 1. Goal

A project shows the tickets that belong to it from the company's ticket system, without switching tools:
open tickets, their history, what is due, and (later) answering or closing them from the workspace.
Claude can read them too ("summarise the open tickets of this customer").

Supported system: **GLPI**. osTicket was considered and dropped (2026-11-16): its official API can only create tickets, and nothing can be installed on the server (see §4).

## 2. How it looks for the user

```yaml
# data/projects/customer-x/project.yaml
tickets:
  feature: ticketsystem
  system: glpi                    # the only system for now; the setting leaves room for others
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

## 4. osTicket: not supported

Dropped on 2026-11-16. The official osTicket API can only **create** tickets (no reading), each API key works from one fixed IP address only, and installing a REST plugin on the osTicket server is not an option. A tab that can only create tickets isn't worth its own feature. If osTicket gets a full official API one day, it can be added as another `system:`.

## 5. How it is built

- New storage type `tickets` with layout `tickets` (like the GitHub *issues* feature: nothing is stored in the project folder).
- `tickets/` with one provider per system (for now `glpi`: API v2, v1 if ever needed). Same interface: `list(filter)`, `get(id)`, later `create`, `followup`, `setStatus`.
- Logins come from `settings.yaml` + [Secrets](../wiki/Secrets.md); sessions/tokens are kept in memory only and renewed automatically.
- Results are cached for 2 minutes in memory (**Refresh** reloads). Ticket contents are **not** written to disk: they can contain personal data.
- API: `GET /api/projects/<p>/f/<f>/tickets?…`, `GET …/tickets/<id>`, later `POST …/tickets`, `POST …/tickets/<id>/followups`, `PATCH …/tickets/<id>`.
- MCP server: `list_tickets`, `read_ticket` (later `add_followup` with confirmation in the app).
- Only HTTPS servers (or `localhost`); self-signed certificates can be allowed per server (`ca:` file).
- Version 1.0 (Rust): the providers move to `pw-server` like the GitHub feature; the contract tests (phase 0 of the migration) include the tickets API with a fake GLPI.

## 6. Testing

- A fake GLPI (API v2) in the automated tests.
- On GitHub runners: the official GLPI Docker image, checked once per release.
- By hand: against your own GLPI.

## 7. Phases and effort

| Phase | What | Days |
|---|---|---|
| A | GLPI 11 read (API v2), list, details, entity filter, due dates, links, MCP read tools | 4–5 |
| B | GLPI write: new ticket, follow-up, status, assign, solution, attachment | 3–4 |

## 8. Decisions (2026-11-16)

1. **GLPI 11** → API v2 (OAuth2) is built first; the legacy API v1 only if someone needs GLPI 10.
2. **osTicket: dropped** — create-only API, no plugin possible on the server (see §4).
3. Tickets belong to a project by **GLPI entity** (`filter: entity:`), optionally narrowed further by category or status.
4. Built **with the Rust version** (after 1.0, see [MIGRATION-RUST.md](../MIGRATION-RUST.md)), not in 0.x.
