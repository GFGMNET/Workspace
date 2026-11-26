# MCP: OpenSCAD

Claude builds things in OpenSCAD for you, from the project's chat. Example: *"Build me a wall bracket for a 30 mm pipe in OpenSCAD, ready for 3D printing"*.

## What you need

- **OpenSCAD** 2021.01 or newer, installed on this PC (it doesn't have to be open).
- **uv** (the app starts the MCP server with `uvx openscad-mcp`): https://docs.astral.sh/uv/
- The [[Chat|Feature-Chat]] feature in the project, and Claude CLI signed in.

## Connect OpenSCAD

Nothing to do in OpenSCAD. If OpenSCAD is not found, set the environment variable `OPENSCAD_PATH` to the
OpenSCAD program (e.g. `C:\Program Files\OpenSCAD\openscad.exe`) and start Workspace again.
The MCP lets Claude look at pictures of the model it built and fix it.

## Switch it on

1. Open the project → **gear (Manage project)** → section **MCP**.
2. Tick **OpenSCAD**. The app writes `programs:` into `project.yaml`:

   ```yaml
   programs:
     - openscad
   ```

3. Open the **Chat** tab and write what you want. The app gives Claude the OpenSCAD MCP and tells it to keep
   the `.scad` models and STL files in the folder **`openscad/`** of your project.

Claude asks before it uses the OpenSCAD tools (unless the chat's `permissions:` say otherwise).

## Example for the chat

> Build me a wall bracket for a 30 mm pipe in OpenSCAD, ready for 3D printing

Claude works in OpenSCAD; the files land in `openscad/` of your project. The app itself shows no extra screen for it.

## If it doesn't work

- OpenSCAD (or its MCP part) is not open/connected → the OpenSCAD tools answer with an error in the chat. Connect it and ask again.
- `uvx` / the program is not found → install it (see *What you need*) and start Workspace again.
- openscad-mcp is a community project; it can change.

See also: [[About MCP|MCP]] · [[Chat|Feature-Chat]]
