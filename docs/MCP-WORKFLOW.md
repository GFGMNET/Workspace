# How an MCP is added

Plans: [docs/plans](plans) (e.g. [BLENDER.md](plans/BLENDER.md))

```mermaid
flowchart TD
 subgraph Maintainer
  M1[Names the program]
  M2[Decides what to use]
  M3[Approves: Ready 2 Deploy]
 end
 subgraph Action
  A1{Existing MCP found?}
  A2[Plan - no checks]
  A3[Built into the open version]
  A4[Wiki article]
  A5{Wiki article done?}
  A6[Release workflow]
 end
 M1 --> A1
 A1 -->|Yes| A2
 A1 -->|No| M2 --> A2
 A2 --> M3 --> A3 --> A4 --> A5
 A5 -->|No| A4
 A5 -->|Yes| A6
```

**Details (for Claude):**
- Name = the program's name. Switched on per project with `programs:` in `project.yaml`; results go into the project folder named after the program (`blender/`, …).
- No checks, no own beta; it goes out with its version — but only together with its wiki article (what is needed, how to connect, a chat example).
