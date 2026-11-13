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
```

| Value under a key | Meaning |
|---|---|
| nothing | Just add the feature |
| a list | First entries. Each is created as a file once; existing files are never overwritten |
| settings (`key: value`) | Override the feature's settings for this project. `items:` holds first entries, `feature:` uses another feature definition |

## Good to know

- **The folder is the truth.** Files you put into a feature folder show up even if they are not listed in `project.yaml`.
- **Unknown features:** a key without a definition shows a notice with a button to create it. The original typos `knowlege` and `skils` are accepted as aliases.
- **Built-in tabs:** every project also has **Overview**, **Explorer**, **VS Code** and **project.yaml**.
- **Editing:** edit `project.yaml` in its tab. It is checked before saving, and errors name the line. Adding a feature with **+ Feature** only appends to the file, so your comments stay.

See also: [[Features]], [[Building Blocks|Building-Blocks]].
