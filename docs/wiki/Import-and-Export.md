# Import and export

There is no special import or export: **everything is a file**. You import by copying files into a feature's folder, and export by copying them out. The app shows new files right away.

## Where things go

Each feature keeps its content in a folder inside the project (`data/projects/<project>/<folder>/`; the folder is the feature's key unless `folder:` says otherwise). Open it with **Explorer** in the app, or *Workspace → Open data folder* in the desktop app.

| Feature type | Files | Import | Export |
|---|---|---|---|
| Wiki, Knowledge (`markdown`) | `*.md` | copy Markdown files in (subfolders are fine) | copy them out; any Markdown editor opens them |
| Gallery (`images`) | pictures, one folder per album | copy photos or whole album folders in, or drag them onto the page | copy the folder out |
| Files, Scripts (`files`) | any files | copy them in, or drag them onto the page | copy them out |
| Tasks, Calendar, Contacts, Devices, Team, MCP (`records`) | one `*.yaml` per record | write or generate YAML files (see below) | copy the YAML files; any program that reads YAML can use them |
| Diagrams | `*.mmd` (Mermaid) | copy Mermaid files in | copy them out; GitHub, VS Code and many tools show Mermaid |
| Chat | `*.json` | not meant to be imported | copy them out |

## Examples

**From Obsidian or another Markdown notes app:** copy the notes (the `.md` files and their pictures) into the project's `wiki/` folder. `[[Links]]` between pages keep working when the titles match.

**Records from a spreadsheet (CSV):** each row becomes one YAML file. Easiest: in the project's **Chat** ask Claude *"turn contacts.csv into contact records"*. Or write them yourself:

```yaml
# data/projects/office/contacts/anna-berg.yaml
name: Anna Berg
email: anna@example.com
phone: +49 30 1234567
```

The field names are the ones listed in the feature (see [[Features]]). Unknown fields are kept and shown too.

**A whole project:** copy the folder `data/projects/<project>` into another workspace's `data/projects/`. It shows up with all its features, as long as that workspace has the same feature types (copy the matching files from `data/features/` too).

**Share a page with someone:** send the `.md` file, or open it in the app and print it to PDF (Ctrl+P).

**A project as a starting point for others:** use **Manage → Save as template** and copy the folder `data/templates/<name>` to the other workspace.

See also: [[Backup]], [[Projects]].
