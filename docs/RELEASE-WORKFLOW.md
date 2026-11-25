# How a version is released (1.0.1 and later)

Releases: [GitHub Releases](https://github.com/GFGMNET/Workspace/releases) · Notes: [docs/releases](releases) ([template](releases/TEMPLATE.md))

```mermaid
flowchart TD
   A["All plans of the version are built"] --> B["Complete beta for the maintainer and testers"]
   B --> C["5 test days"]
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

Hiccups never delay a release. The day-5 step runs as a scheduled task that Claude sets when the complete beta is out.
