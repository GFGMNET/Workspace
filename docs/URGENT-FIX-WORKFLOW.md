# How a serious bug is fixed (urgent fix)

Bugs: [BUG-WORKFLOW](BUG-WORKFLOW.md) · Backup: [wiki Backup](https://github.com/GFGMNET/Workspace/wiki/Backup) · [FAQ](https://github.com/GFGMNET/Workspace/wiki/FAQ)


```mermaid
flowchart TD
 subgraph User
  BUG[Report an Issue]
 end
 subgraph Maintainer
  RM[The Maintainer review the Issue]
  WIF{What Kind of Issue}
  SEC[Secruity Issue]
  DEA[Serious Issue]
  BUN[Bug]
  HIC[Hiccup]
 end
 subgraph Action
  ADL[Hiccup Workflow]
  ASW[Secruity Wokflow]
  ABW[BUG Workflow]
 end
 
 BUG --> RM
 RM --> WIF
 WIF --> SEC
 WIF --> DEA
 WIF --> BUN
 WIF --> HIC
 HIC --> ADL
 BUN --> ABW
 DEA --> ABW
 SEC --> ASW
 
```
