# How ideas become a vote

Form: [New idea](https://github.com/GFGMNET/Workspace/issues/new?template=new-idea.yml) · Votes: [wiki](https://github.com/GFGMNET/Workspace/wiki/Vote-for-features)

```mermaid
flowchart TD
 subgraph User
  U1[Sends an idea]
  U2[Answers the question]
  U3[Votes yes or no]
 end
 subgraph Maintainer
  M1{Is the idea clear?}
  M2[Asks the user]
  M3{Good idea?}
  M4[Own idea]
  M5{Should it come?}
 end
 subgraph Action
  A1[Duplicate check]
  A2[Up for a vote, idea closed]
  A3[Idea closed: not planned]
  A4[Feature workflow, vote closed]
  A5[Vote closed: not planned]
 end
 U1 --> A1 --> M1
 M1 -->|No| M2 --> U2 --> M1
 M1 -->|Yes| M3
 M3 -->|Yes| A2
 M3 -->|No| A3
 M4 --> A2
 A2 --> U3 --> M5
 M5 -->|Yes| A4
 M5 -->|No| A5
 M5 -->|Not yet| U3
```

**Details (for Claude):**
- An idea arrives by the form *New idea* (label `idea` set automatically) or as a normal issue (the maintainer sets `idea`). His own ideas go straight to a `Vote: …` issue.
- Duplicate check: `duplicate-check.yml` compares with open ideas and votes → comment + label `possible-duplicate`. A duplicate is closed with "Already known: #number".
- Up for a vote: new issue `Vote: …`, label `vote`, text "Idea from #number (thanks @user)"; the idea is closed with "Now up for a vote: #number".
- Not planned: closed as *not planned* with "This will not be added. Thanks @user for the idea!".
- Votes count only on the first post; the wiki list is updated daily. Votes never move a release.
