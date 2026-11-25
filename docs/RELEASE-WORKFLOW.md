# How a version is released (1.0.1 and later)

Releases: [GitHub Releases](https://github.com/GFGMNET/Workspace/releases) · Notes: [docs/releases](releases) ([template](releases/TEMPLATE.md))

```mermaid
flowchart TD
   Z["Maintainer asks for a feature"] --> Y["Plan + checks (FEATURE-WORKFLOW)"]
   Y --> X["Ready 2 Deploy"]
   X --> A["Built into the next version"]
   A --> B["Complete beta for the maintainer and testers<br/>— only now the release date is set (day 5)"]
   B --> C["5 test days — nothing new is added:<br/>a new feature asked for now goes into the next version (1.0.2)"]
   C --> D{"Bug (label bug) in the 5 days?"}
   D -->|No| G["Security gate: Rust security check + CodeQL"]
   D -->|Yes| E["Release moves ONCE by 5 days<br/>and brings all fixes"]
   E --> F["Bugs found in the extra days<br/>go into the next version"]
   F --> G
   G --> H{"Clean?"}
   H -->|No| I["Fix it first, like a bug"]
   I --> G
   H -->|Yes| J["Release: README from readme-next,<br/>wiki from wiki-next, release notes, milestone closed"]
   J --> K([End])
```

No release date is fixed in advance: as quick and as safe as possible — the date is set when the complete beta is out.
Hiccups never delay a release. The day-5 step runs as a scheduled task that Claude sets when the complete beta is out.
