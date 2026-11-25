# How a version is released (1.0.1 and later)

Releases: [GitHub Releases](https://github.com/GFGMNET/Workspace/releases) · Notes: [docs/releases](releases) ([template](releases/TEMPLATE.md))

```mermaid
flowchart TD
 subgraph Maintainer
  M1[Asks for features]
  M2[Closes the version]
 end
 subgraph User
  U1[Testers test 5 days]
 end
 subgraph Action
  A1[Ready features go into the open version]
  A2[Warning: what is not in it]
  A3[Complete beta - release date set]
  A4{Bug in the 5 days?}
  A5[Release moves once by 5 days]
  A6{Security check clean?}
  A7[Fix it first]
  A8[Release]
 end
 M1 --> A1 --> M2 --> A2 --> A3 --> U1 --> A4
 A4 -->|No| A6
 A4 -->|Yes| A5 --> A6
 A6 -->|No| A7 --> A6
 A6 -->|Yes| A8
```

**Details (for Claude):**
- No release date in advance: the date is set when the complete beta is out (day 5, or once 5 days later). The day-5 step runs as a scheduled task.
- For now the maintainer closes a version ("close 1.0.x"); later it may close by itself after a fixed number of days.
- Not Ready 2 Deploy when the version closes → not in it, with a warning; it goes into the next version once ready.
- Nothing new in the test days; bugs in the extra days → next version; hiccups never delay.
- Release: README from `docs/readme-next/`, wiki from `docs/wiki-next/`, release notes, milestone closed.
