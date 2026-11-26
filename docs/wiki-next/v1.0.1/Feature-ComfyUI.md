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
