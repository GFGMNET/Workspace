# Plan: Ticketsystem

## 1) Name

Ticketsystem

## 2) Planned release version

1.1

## 3) Feasible? Checked per function, with the result

| part | desc | state | suggestion |
|---|---|---|---|
| Tickets | read: list of the tickets of the entity, one ticket | unchecked | check against the GLPI test environment, from GitHub's Windows and Linux machines |
| Tickets | write: create a ticket in the entity | unchecked | same |
| Tickets | write: edit a ticket's text | unchecked | same |
| Tickets | write: set the state of a ticket | unchecked | same |
| Tickets | write: add a solution to a ticket, read it | unchecked | same |
| Follow-ups | read: follow-ups of a ticket | unchecked | same |
| Follow-ups | write: add a follow-up to a ticket | unchecked | same |
| Entity | only tickets of the entity with the project's name | unchecked | same, with two test entities |

Checked: 0 · Unchecked: 8 · Failed: 0

Check: `docs/plans/checks/glpi-check.js` (needs the secret `GLPI_TOKEN`).

## 4) Description

Tickets and comments (GLPI follow-ups) from GLPI, filtered by entity (the entity is the project name). Read and write,
including editing the text, setting the state of a ticket and the solution.

## 5) Open points, only about this feature

None.

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | GLPI 11 only (osTicket dropped). |
| 2 | Filter by entity; the entity is the project name. |
| 3 | The checks run against the maintainer's GLPI test environment (`ticket.bbdi42.de`). |
| 4 | Only tickets — no GLPI changes (changed by the maintainer 2026-11-19). |
| 5 | Comments are GLPI follow-ups. |
| 6 | Writing includes editing a ticket's text. |
| 7 | Login: for the test the account Hermes; in the live environment the account is set in the YAML file (the token as `${secret:…}`, project rule: no secrets in project files). |
| 8 | The tab is called "Ticket". |
| 9 | The screens as in the approved screenshots: [list](img/glpi-list.png), [one ticket](img/glpi-ticket.png). |

## 7) Risks

Written after the checks.

## 8) Detail workflow

Written after the checks and the open points.
