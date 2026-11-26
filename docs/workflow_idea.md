```mermaid
flowchart TD
 subgraph USER
  STA@{ shape: circle, label: "Start" }
  FOR[Form or assign Label IDEA]
  ASK[Open points]
  NOT[Notify] 
 end
 subgraph MAINTAINER
  CLE{Clear}
  DES{Decide if it is up for an vote}
 end
 subgraph Action
  VOT[NEW Issue Label:VOTE]
  DES{Decide if it is up for an vote}
 end
  
 
 
 STA --> FOR
 FOR --> CLE
 CLE <--> |NO|ASK
 CLE --> |YES|DES
 DES --> |YES|VOT
 VOT --> NOT
 DES --> |NO|NOT
 
 
 
 
 ```
