---
name: write-plan
description: Use when the maintainer asks for a new feature or an upgrade and a plan must be written in docs/plans/ in his fixed 8-part format.
---

# Write a plan (format decided by the maintainer 2026-11-19)

The **functions come from the maintainer** — never plan from your own guess; ask first what it should do.

## The file `docs/plans/<NAME>.md` has exactly these parts, in this order

1) Name:
2) Planned release version:
3) Feasible? Checked per function, with the result (simple list)
4) Description
5) Open points, only about this feature
6) Decisions, only about this feature
7) Risks
8) Detail workflow

## Rules

- Anything that is not the maintainer's own words or decision (design details, extra checks, extra steps, suggestions)
  goes into **5) Open points** as a question — never into 4, 6 or 8 as if decided.
- Before showing the plan, list yourself what in it was not requested.
- Every function needs a **check** (a script in `docs/plans/checks/`, run by the workflow *Plan checks* on Windows + Linux)
  with its result in part 3. A function that is not checked or whose check failed can't be approved.
  MCP plans are the exception: no checks, but a wiki article is required.
- Screens: show them as pictures (`docs/plans/img/`), built from the existing look (`docs/LAYOUT-AND-DESIGN.md`).
- Before work starts the maintainer gets the open points and risks; nothing begins until he has seen them.
- Status line under the title: draft → **Ready 2 Deploy** (only when he approves) → "Released in X.Y.Z".
  A plan he changes after Ready 2 Deploy loses that state until the new part is checked and he approves again.
- An **upgrade** of an existing feature gets its own short plan "<Feature>: <upgrade>" that refers to the existing plan.
- Open a GitHub issue for it (label `enhancement`, milestone of the version).
