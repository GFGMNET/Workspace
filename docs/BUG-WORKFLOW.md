# How a bug is handled

Start: [ISSUE-WORKFLOW](ISSUE-WORKFLOW.md) · Known bugs: [wiki](https://github.com/GFGMNET/Workspace/wiki/Known-bugs)

```mermaid
flowchart TD
 subgraph Maintainer
  M1[Sets the label bug]
 end
 subgraph Action
  A1[Duplicate check]
  A2{When was it reported?}
  A3[Fixed in the open version]
  A4[Fixed - release moves once by 5 days]
  A5[Fixed in the next version]
  A6[Release notes: Fixed]
 end
 M1 --> A1 --> A2
 A2 -->|While a version is built| A3
 A2 -->|In the 5 test days| A4
 A2 -->|Extra days or code freeze| A5
 A3 --> A6
 A4 --> A6
 A5 --> A6
```

**Details (for Claude):**
- Serious bugs go to the [urgent fix workflow](URGENT-FIX-WORKFLOW.md), not here.
- Duplicate check: `duplicate-check.yml` compares with all bugs (open and fixed) → comment + label `possible-duplicate`.
- Every fix gets an automatic test; the commit says `Closes #number`. Fixed bugs are listed on the wiki page *Known bugs*.
