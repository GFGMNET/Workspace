```mermaid
flowchart LR
 subgraph Maintainer
  direction TB
  STA@{ shape: circle, label: "Start" }
  DEA[Serious]
  BUG[BUG]
  CLE{Clear}
  KIN{KIND}
 end
 subgraph USER
  COM[Aks the User]
 end
 subgraph ACTION
  direction TB
  SET[PRIO]
  PLAN[Scedule the Release]
  END@{ shape: circle, label: "END" }
 end
 
 STA --> CLE
 CLE <--> |NO|COM 
 CLE --> |YES|KIN
 KIN --> DEA
 KIN --> BUG
 DEA --> SET
 BUG --> SET
 SET --> PLAN
 PLAN --> END

 
```
