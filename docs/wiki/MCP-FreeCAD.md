# MCP: FreeCAD

Claude builds things in FreeCAD for you, from the project's chat. Example: *"Build me a mounting plate 80×40 mm with four M4 holes in FreeCAD and export it as STL"*.

## What you need

- **FreeCAD**, open on this PC.
- **FreeCAD Robust MCP** (Apache-2.0, https://github.com/spkane/freecad-addon-robust-mcp-server): **Python 3.11+**,
  `pip install freecad-robust-mcp`, and the **Robust MCP Bridge** workbench in FreeCAD.
- The [[Chat|Feature-Chat]] feature in the project, and Claude CLI signed in.

## Connect FreeCAD

1. In a terminal, once: `freecad-mcp --pair-bridge`.
2. In FreeCAD: workbench **Robust MCP Bridge** → **Start MCP Bridge**. Keep FreeCAD open.
3. The app starts `freecad-mcp` with `FREECAD_MODE=xmlrpc`.

## Switch it on

1. Open the project → **gear (Manage project)** → section **MCP**.
2. Tick **FreeCAD**. The app writes `programs:` into `project.yaml`:

   ```yaml
   programs:
     - freecad
   ```

3. Open the **Chat** tab and write what you want. The app gives Claude the FreeCAD MCP and tells it to keep
   the FreeCAD files (`.FCStd`) and exports in the folder **`freecad/`** of your project.

Claude asks before it uses the FreeCAD tools (unless the chat's `permissions:` say otherwise).

## Example for the chat

> Build me a mounting plate 80×40 mm with four M4 holes in FreeCAD and export it as STL

Claude works in FreeCAD; the files land in `freecad/` of your project. The app itself shows no extra screen for it.

## If it doesn't work

- FreeCAD (or its MCP part) is not open/connected → the FreeCAD tools answer with an error in the chat. Connect it and ask again.
- `uvx` / the program is not found → install it (see *What you need*) and start Workspace again.
- It can run Python inside FreeCAD and change the FreeCAD files. It is still *beta*.

See also: [[About MCP|MCP]] · [[Chat|Feature-Chat]]
