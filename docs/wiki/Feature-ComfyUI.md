# ComfyUI

Runs the project's [ComfyUI](https://www.comfy.org/) workflows from a tab and keeps the results (pictures, video, audio) in the project. Claude is not used.

## What you need

- ComfyUI running on this PC or in your network (default address `http://127.0.0.1:8188`).
- Workflows saved in ComfyUI with **Workflow → Export (API)**. The normal "Save" format can't be run.

| | |
|---|---|
| Stores | `comfyui` |
| Layout | `comfyui` |
| Definition | `data/features/comfyui.yaml` |

## Add it to a project

```yaml
comfyui:
  url: http://127.0.0.1:8188      # or http://<address in your network>:8188
```

Or click **+ Feature** in the project's tab row, then set the address in `project.yaml`. Without an address the tab says so.

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# ComfyUI: run the project's workflows (comfyui/workflows/, saved in ComfyUI with Export (API)) and keep the results
# (plan docs/plans/COMFYUI.md). Set the address of ComfyUI in each project's project.yaml:
#   comfyui:
#     url: http://127.0.0.1:8188      # or http://<address in your network>:8188
# Results go into the Gallery's album KI_Pictures when the project has a Gallery, otherwise into comfyui/results/.
name: ComfyUI
icon: image
stores: comfyui
layout: comfyui
```

## Settings

Every setting can also be set **for one project only**, under the feature key in that project's `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue, github, audio, key, layers | by layout |
| `aliases` | Other keys in project.yaml that mean this feature | none |
| `url` | The address of ComfyUI, e.g. `http://127.0.0.1:8188` | **required** |
| `folder` | Folder inside the project for the workflows (and the results, when there is no Gallery) | `comfyui` |

## Using it

1. Click **+** to upload a workflow (the API file from ComfyUI) and give it a label: picture, video or audio.
2. Select the workflow. The app shows one field for each text box it finds, marked **positive** or **negative**, filled with the workflow's text. Change the text.
3. Click **Run**. While ComfyUI works the tab shows *Running…* with **Cancel**.
4. The results appear below. Click one to see it large; you can delete it.

## On disk

```
projects/<project>/comfyui/workflows/   the workflows (+ labels.json)
projects/<project>/gallery/KI_Pictures/ the results, when the project has a Gallery
projects/<project>/comfyui/results/     the results otherwise
```

See also: [[Features]] · [[Gallery|Feature-Gallery]]
