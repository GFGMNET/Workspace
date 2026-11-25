# How a serious bug is fixed (urgent fix)

Start: [ISSUE-WORKFLOW](ISSUE-WORKFLOW.md)

```mermaid
flowchart TD
 subgraph Maintainer
  M1[Serious bug or security issue in a released version]
  M2[Tests the fix]
  M3[OK to release]
 end
 subgraph Action
  A1[Fix only that]
  A2[Fix version with four numbers]
  A3[Security check]
  A4[Release]
  A5[Fix also in the next version]
 end
 M1 --> A1 --> A2 --> A3 --> M2 --> M3 --> A4 --> A5
```

**Details (for Claude):**
- Only the maintainer decides what is serious. A security issue in a released version is always an urgent fix, as soon as possible. Lost data is the user's responsibility (wiki *Backup*); "doesn't start" → FAQ first.
- Version numbers: 1.0 → 1.0.0.1, 1.0.1 → 1.0.1.1, 1.0.1.2 … The app compares all four numbers (#123).
- Security check = Rust security check + CodeQL, both clean. He tests as long as the fix needs. The next normal version keeps its date.
