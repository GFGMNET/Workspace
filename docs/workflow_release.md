```mermaid
flowchart TD
 subgraph MAINTAINER
    STA@{ shape: circle, label: "Start" }
	DEC[Maintainer Reqeuest]
	BUG[From BUG]
	SEC[From SEC]
	HIC[FROM HIC]
	VOT[FROM Votes]
 end
 subgraph LLM
  CHE[Check]
  DEP[Deploy]
  DIF[Deploy]
  BET{Between RELEASE}
  BIT{Between RELEASE}
  ISEC{Is an Security ISSUE}
  WAU{Wait 5 Days Without ERROR}
  DEL[Delay next Release 5 days]
  TES{In Testing Period}
  PLAN[Plan new Release]
 end
  
 
 
 STA --> DEC
 STA --> BUG
 STA --> SEC
 STA --> HIC
 STA --> VOT
 DEC --> CHE 
 BUG --> CHE 
 SEC --> CHE 
 HIC --> CHE 
 VOT --> CHE 
 CHE --> ISEC
 ISEC --> |Yes|BET
 BET --> |YES|DEP 
 BET --> |NO|DIF
 DEP --> DEL
 ISEC --> |NO|BIT
 BIT --> |Yes|TES
 TES --> |YES| DEP
 TES --> |NO| PLAN
 PLAN --> WAU
 WAU --> |YES|DEL
 
 
 ```
