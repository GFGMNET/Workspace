# How a new feature is made

Plans: [docs/plans](plans) · Checks: [docs/plans/checks](plans/checks)

```mermaid
flowchart TD
   A["Maintainer names the feature and its functions"] --> U{"New feature or upgrade<br/>of an existing one?"}
   U -->|New: a new tab or function| B["Claude writes the plan (8 parts)"]
   U -->|Upgrade: extends an existing feature| V["Own short plan 'Feature: upgrade'<br/>(e.g. Version Control: write and push),<br/>refers to the existing plan — only the new functions"]
   V --> C
   B --> C["Check every function (docs/plans/checks)"]
   C --> D{"All checks OK?"}
   D -->|No| E["Maintainer decides: change the function or drop it"]
   E --> B
   D -->|Yes| F["Maintainer sees the open points and risks"]
   F --> G{"Open points answered?"}
   G -->|No| F
   G -->|Yes| H["Maintainer approves: Ready 2 Deploy"]
   H --> K["Into the open version: Claude builds it + automatic tests"]
   K --> L{"Can it be built as planned?"}
   L -->|No| M["Stop and ask the maintainer"]
   M --> K
   L -->|Yes| N["Docs: wiki-next, readme-next, release notes (new → New, upgrade → New/Changed);<br/>built-in feature upgraded → its version: number goes up"]
   N --> O["Beta: maintainer and testers test"]
   O --> P{"Bug found?"}
   P -->|Yes| Q["Fix it, next beta"]
   Q --> O
   P -->|No| R["Security gate: Rust security check + CodeQL clean"]
   R --> S["Release (RELEASE-WORKFLOW)"]
   S --> T([End])
```
