```mermaid
flowchart LR
 subgraph Maintainer
  direction TB
  STA@{ shape: circle, label: "Start" }
  CLE{Clear}
 end
 subgraph USER
  COM[Aks the User]
 end
 subgraph Action
  direction TB
   ADD[to Wikipage]
   END@{ shape: circle, label: "reviewed Monthly]}
 end

 
STA --> CLE
CLE <--> |NO|COM
CLE --> |YES|ADD
ADD --> END
 
 ```
