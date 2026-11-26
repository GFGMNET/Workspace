```mermaid
flowchart LR
 subgraph Maintainer
  STA@{ shape: circle, label: "Start" }
  DEA[Serious]
  BUG[BUG]
  CLE{Clear}
  KIN{KIND}
 end
 subgraph USER
  COM[Aks the User]
 end
 
 STA --> CLE
 CLE <--> |NO|COM 
 CLE --> |YES|KIN
 KIN --> DEA
 KIN --> BUG
 

 
```
