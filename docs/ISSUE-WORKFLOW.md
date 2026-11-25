# How an issue is handled (start here)

Report: [new issue](https://github.com/GFGMNET/Workspace/issues/new/choose)

```mermaid
flowchart TD
 subgraph User
  BUG[Report an issue]
 end
 subgraph Maintainer
  RM[The maintainer reviews the issue]
  WIF{What kind of issue?}
  SEC[Security issue]
  DEA[Serious issue]
  BUN[Bug]
  HIC[Hiccup]
  IDE[Wish, not a bug]
  DUP[Already known]
 end
 subgraph Action
  ASW[Security workflow]
  AUW[Urgent fix workflow]
  ABW[Bug workflow]
  ADL[Label hiccup + close]
  AIW[Ideas workflow]
  ACL[Close with: Already known #number]
 end
 BUG --> RM --> WIF
 WIF --> SEC --> ASW
 WIF --> DEA --> AUW
 WIF --> BUN --> ABW
 WIF --> HIC --> ADL
 WIF --> IDE --> AIW
 WIF --> DUP --> ACL
```

**Details (for Claude):**
- Workflows: [SECURITY](SECURITY-WORKFLOW.md) · [URGENT-FIX](URGENT-FIX-WORKFLOW.md) · [BUG](BUG-WORKFLOW.md) · [IDEAS](IDEAS-WORKFLOW.md)
- Only the maintainer decides the kind and sets the label (`bug`, `hiccup`, `security`). Hiccups are listed on the wiki page *Known hiccups* and never delay a release.
- Unclear reports: the maintainer asks on the issue first.
