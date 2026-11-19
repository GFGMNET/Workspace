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
| Tickets | write: set the state of a ticket | unchecked | same |
| Tickets | write: add a solution to a ticket | unchecked | same |
| Changes | read: list of the changes of the entity, one change | unchecked | same |
| Changes | write: create a change in the entity | unchecked | same |
| Comments | read: comments of a ticket or change | unchecked | same |
| Comments | write: add a comment | unchecked | same |
| Entity | only what belongs to the entity with the project's name | unchecked | same, with two test entities |

Checked: 0 · Unchecked: 9 · Failed: 0

Check: `docs/plans/checks/glpi-check.js` (needs the secret `GLPI_TOKEN`).

## 4) Description

Tickets, changes and comments from GLPI, filtered by entity (the entity is the project name). Read and write, including
setting the state of a ticket and the solution.

## 5) Open points, only about this feature

| id | question |
|---|---|
| 1 | "Changes" means GLPI's Changes (change management), not the change history of a ticket? |
| 2 | "Comments" means GLPI's follow-ups on a ticket or change? |
| 3 | Does "write" also mean editing a ticket's text? |
| 4 | Show the solution too when reading a ticket? |
| 5 | Login: which GLPI account, stored in the app's secrets? |

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | GLPI 11 only (osTicket dropped). |
| 2 | Filter by entity; the entity is the project name. |
| 3 | The checks run against the maintainer's GLPI test environment (`ticket.bbdi42.de`). |

## 7) Risks

Written after the checks.

## 8) Detail workflow

Written after the checks and the open points.
