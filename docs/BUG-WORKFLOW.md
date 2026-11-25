# How a bug is handled

Open bugs: [label bug](https://github.com/GFGMNET/Workspace/issues?q=is%3Aissue+is%3Aopen+label%3Abug) · Release rule: [RELEASE-WORKFLOW](RELEASE-WORKFLOW.md)

```mermaid
flowchart TD
   A["Someone reports a bug (issue)"] --> B{"Maintainer decides: bug or hiccup?"}
   B -->|Unclear| C["Ask the reporter on the issue"]
   C --> B
   B -->|Hiccup| D["Close it — hiccups never delay a release"]
   B -->|Bug| E["Maintainer sets the label bug"]
   F{"When was it reported?"}
   E --> S{"Serious? (maintainer decides)"}
   S -->|Yes| U["Urgent fix: see URGENT-FIX-WORKFLOW"]
   S -->|No| F
   F -->|While a version is built| G["Fixed in that version"]
   F -->|In the 5 test days| H["Fixed; the release moves ONCE by 5 days"]
   F -->|In the extra days or after the code freeze| I["Goes into the next version"]
   G --> J["Fix + automatic test; commit says Closes #number"]
   H --> J
   I --> J
   J --> K["Release notes: Fixed"]
   D --> L([End])
   U --> L
   K --> L
```
