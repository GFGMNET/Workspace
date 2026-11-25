# How a new feature is made

Plans: [docs/plans](plans) · Checks: [docs/plans/checks](plans/checks)

```mermaid
flowchart TD
 subgraph Maintainer
  M1[Names a feature or an upgrade]
  M2[Sees open points and risks]
  M3[Approves: Ready 2 Deploy]
  M4[Changes the plan]
  M5[Decides: change or drop]
 end
 subgraph Action
  A1[Plan]
  A2{All checks OK?}
  A3[Built into the open version]
  A4{Built as planned?}
  A5[Stop and ask the maintainer]
  A6[Docs and release notes]
  A7[Release workflow]
 end
 M1 --> A1 --> A2
 A2 -->|No| M5 --> A1
 A2 -->|Yes| M2 --> M3 --> A3 --> A4
 A4 -->|No| A5 --> M2
 A4 -->|Yes| A6 --> A7
 M3 --> M4 --> A1
```

**Details (for Claude):**
- Plan: 8 parts (CLAUDE.md); an upgrade gets its own short plan "<Feature>: <upgrade>" that refers to the existing plan.
- Every function is checked (`docs/plans/checks/`). A changed plan loses Ready 2 Deploy until the new part is checked and approved again.
- Docs: wiki in `docs/wiki-next/vX.Y.Z/`, `docs/readme-next/README.md`, `docs/releases/vX.Y.Z.md`; a built-in feature's `version:` goes up.
