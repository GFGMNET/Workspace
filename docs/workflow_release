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
  BET{Between RELEASE}
  ISEC{Is an Security ISSUE}
  WAU@{ shape: hourglass, label: "5 Days Without ERROR" }
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
 BET --> Deploy
 
 
 ```
