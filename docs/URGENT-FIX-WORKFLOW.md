# How a serious bug is fixed (urgent fix)

Bugs: [BUG-WORKFLOW](BUG-WORKFLOW.md) · Backup: [wiki Backup](https://github.com/GFGMNET/Workspace/wiki/Backup) · [FAQ](https://github.com/GFGMNET/Workspace/wiki/FAQ)

```mermaid
flowchart TD
   A["Bug reported after a release"] --> B{"Serious? Only the maintainer decides"}
   B --> C["Security hole: depends on it, most likely serious<br/>— closed as soon as possible"]
   B --> D["Data lost: the user is responsible for his data<br/>(wiki Backup) — not the app, not the maintainer"]
   B --> E["App doesn't start: first check the FAQ"]
   C --> F{"Serious?"}
   D --> F
   E --> F
   F -->|No| G["Normal bug: next version (BUG-WORKFLOW)"]
   F -->|Yes| H["Claude fixes only that"]
   H --> I["Fix version with four digits:<br/>1.0.1 → 1.0.1.1, 1.0.1.2 … (1.0 → 1.0.0.1)"]
   I --> J["Security gate: Rust security check + CodeQL clean"]
   J --> K["Maintainer tests it — as long as the fix needs"]
   K --> L["Release (maintainer's OK)"]
   L --> N["The fix also goes into the next version;<br/>that version keeps its date"]
   N --> M([End])
   G --> M
```
