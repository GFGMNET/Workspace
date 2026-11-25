# How a security issue is handled

Known security issues: [wiki](https://github.com/GFGMNET/Workspace/wiki/Known-security-issues)

```mermaid
flowchart TD
 subgraph User
  U1[Reports it privately]
 end
 subgraph Maintainer
  M1[Reviews it]
 end
 subgraph Action
  A0[Automatic security check finds something]
  A1[Fixed first]
  A2{Checks clean?}
  A3{Version already out?}
  A4[Urgent fix workflow]
  A5[Goes out with the open version]
 end
 U1 --> M1
 A0 --> M1
 M1 --> A1 --> A2
 A2 -->|No| A1
 A2 -->|Yes| A3
 A3 -->|Yes| A4
 A3 -->|No| A5
```

**Details (for Claude):**
- Private report: GitHub → Security tab → *Report a vulnerability* (switched on).
- Automatic checks: Rust security check (`rust-security.yml`, its message gets the label `security-check`) and CodeQL.
- A real problem gets its own issue with the label `security`. Fixed first — also during a code freeze. A Rust library: Actions *Rust lock update* with the crate names → commit the new `rust/Cargo.lock` from branch `rust-lock-update`.
- Never release with a failing security check.
