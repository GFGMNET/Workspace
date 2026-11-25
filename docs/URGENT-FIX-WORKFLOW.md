# How a serious bug is fixed (urgent fix)

Bugs: [BUG-WORKFLOW](BUG-WORKFLOW.md) · Backup: [wiki Backup](https://github.com/GFGMNET/Workspace/wiki/Backup) · [FAQ](https://github.com/GFGMNET/Workspace/wiki/FAQ)

```mermaid
flowchart TD
   A["Bug reported after a release"] --> B{"Serious? Only the maintainer decides"}
   B --> C["Security hole: depends on it, most likely serious"]
   B --> D["Data lost: the user is responsible for his data<br/>(wiki Backup) — not the app, not the maintainer"]
   B --> E["App doesn't start: first check the FAQ"]
   C --> F{"Serious?"}
   D --> F
   E --> F
   F -->|No| G["Normal bug: next version (BUG-WORKFLOW)"]
   F -->|Yes| H["Claude fixes only that"]
   H --> I["Fix version with four digits:<br/>1.0.1 → 1.0.1.1, 1.0.1.2 … (1.0 → 1.0.0.1)"]
   I --> J["Security gate: Rust security check + CodeQL clean"]
   J --> K["Maintainer tests it"]
   K --> L["Release (maintainer's OK)"]
   L --> M([End])
   G --> M
```
