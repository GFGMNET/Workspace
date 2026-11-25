# How a serious bug is fixed (urgent fix)

Bugs: [BUG-WORKFLOW](BUG-WORKFLOW.md) · Backup: [wiki Backup](https://github.com/GFGMNET/Workspace/wiki/Backup) · [FAQ](https://github.com/GFGMNET/Workspace/wiki/FAQ)

```mermaid
flowchart TD
   A["Bug reported after a release"] --> B{"What kind of problem?"}
   B --> C["Security hole in a released version:<br/>always an urgent fix, as soon as possible"]
   B --> D["Data lost: the user is responsible for his data<br/>(wiki Backup) — not the app, not the maintainer"]
   B --> E["App doesn't start: first check the FAQ"]
   B --> O["Another bug"]
   C --> H["Claude fixes only that"]
   D --> F{"Serious? Only the maintainer decides"}
   E --> F
   O --> F
   F -->|No| G["Normal bug: next version (BUG-WORKFLOW)"]
   F -->|Yes| H
   H --> I["Fix version with four digits:<br/>1.0.1 → 1.0.1.1, 1.0.1.2 … (1.0 → 1.0.0.1)"]
   I --> J["Security gate: Rust security check + CodeQL clean"]
   J --> K["Maintainer tests it — as long as the fix needs"]
   K --> L["Release (maintainer's OK)"]
   L --> N["The fix also goes into the next version;<br/>that version keeps its date"]
   N --> M([End])
   G --> M
```

```mermaid
flowchart TD
 subgraph User
  BUG[Report an Issue]
 end
 subgraph Maintainer
  RM[The Maintainer review the Issue]
  WIF{What Kind of Issue}
 end
 subgraph Maintainer
  SEC[Secruity Issue]
  DEA[Serious Issue]
  BUN[Bug]
  HIC[Hiccup]
 end
 
 BUG --> RM
 RM --> WIF
 WIF --> SEC
 WIF --> DEA
```
