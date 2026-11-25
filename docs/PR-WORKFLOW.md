# How a pull request from others is handled

Pull requests: [open](https://github.com/GFGMNET/Workspace/pulls)

```mermaid
flowchart TD
 subgraph User
  U1[Sends a pull request]
  U2[Fixes it]
 end
 subgraph Action
  A1[Claude checks it]
  A2[Built-in feature gets a test]
 end
 subgraph Maintainer
  M1{All OK?}
  M2[Asks to fix it]
  M3{Merge?}
  M4[Merges]
  M5[Closes it]
 end
 U1 --> A1 --> M1
 M1 -->|No| M2 --> U2 --> A1
 M1 -->|Yes| M3
 M3 -->|Yes| M4 --> A2
 M3 -->|No| M5
```

**Details (for Claude):**
- Claude checks: what it changes, tests on Windows + Linux, Rust security check + CodeQL, no secrets or client data, a new function has an approved plan, docs updated — and tells the maintainer in plain words.
- Only the maintainer merges. A built-in feature (`app/starter/features/`) gets a test before it goes into a release.
