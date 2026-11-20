# Projects

Every project is a folder in `data/projects/`, and its **`project.yaml`** says which features it has. Each feature becomes a tab on the project page, in the order written.

```yaml
name: Home Lab                  # shown everywhere
description: My network at home # optional
icon: "🏠"                      # optional: emoji or letter
color: "#b4501a"                # optional
tags: [network]                 # optional
wiki:                           # a feature, nothing else
tasks:
  - Replace the old switch      # first entries, created as files
  - title: Label all cables     # a record with fields
    status: Done
chat:
  permissions: auto             # settings only for this project
photos:
  feature: gallery              # use a feature under another name
overview: false                 # optional: hide the Overview tab
location: C:\dev\MyRepo         # optional: the content lives in this existing folder
```

| Value under a key | Meaning |
|---|---|
| nothing | Just add the feature |
| a list | First entries. Each is created as a file once; existing files are never overwritten |
| settings (`key: value`) | Override the feature's settings for this project. `items:` holds first entries, `feature:` uses another feature definition |

## Projects in an existing folder

With `location:` a project works on a folder you already have, for example a git clone or a share. `project.yaml` stays in `data/projects/<name>/`, and everything else uses that folder: features, Explorer, chat, scripts and the VS Code tab. You can write `~` for your home folder and `{install}` for the program folder.

The example project **Workspace (development)** manages the workspace itself this way:
- its `docs/` folder as a wiki
- `tools/` as scripts
- the GitHub issues
- chat
- a *release* skill

## Rename, archive, delete

**Manage** — the gear icon in the project header. It also shows the project's folder, with *Copy path*, *Copy Claude CLI command* and *Open in VS Code*.

If a project has many features, the tabs that don't fit are under **More**.

In **Manage**:

- **Rename:** changes the name in `project.yaml`, and the rest of the file stays as it is. Tick *Also rename the folder* to rename `projects/<name>` too.
- **Features:** remove a feature from the project. Its files stay in the folder.
- **Archive:** hides the project. Its folder moves to `data/projects/_archive/`. The home page lists *Archived projects*, where you can **Restore** or **Delete** them.
- **Delete:** deletes the project's folder for good. Type the name to confirm. For a project with `location:`, only its folder in `data/projects/` is deleted, never the content folder it points to.

Deleting the folder `data/projects/<name>` by hand does the same.

## Templates

**Manage → Save as template** keeps a project as a starting point: its `project.yaml` and, if you tick *Include the content*, its pages, records, pictures, files and scripts. Chats are never copied, and `location:` is left out.

**New project → Start from** lists your templates. The `project.yaml` is filled in and can still be changed before you create the project. Delete a template from the same place.

Templates are folders in `data/templates/`, so you can copy them to another workspace.

## Good to know

- **The folder is the truth.** Files you put into a feature folder show up even if they are not listed in `project.yaml`.
- **Unknown features:** a key without a definition shows a notice with a button to create it. The original typos `knowlege` and `skils` are accepted as aliases.
- **Built-in tabs:** every project also has **Overview**, **Explorer**, **VS Code** and **project.yaml**.
- **Tabs:** click **Tabs** (the eye, next to **+** in the tab row) and untick the tabs you don't want to see in this project. It is saved in `project.yaml` as `hide_tabs: [diagrams, map]` (feature keys, plus `overview`, `explorer`, `vscode`). **Show all** brings them back. The open tab is always shown.
- **Editing:** edit `project.yaml` with the gear (⚙) next to the project name → **project.yaml**. It is checked before saving, and errors name the line. Adding a feature with **+ Feature** only appends to the file, so your comments stay.

See also: [[Features]], [[Building Blocks|Building-Blocks]].
