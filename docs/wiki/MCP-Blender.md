# MCP: Blender

Claude builds things in Blender for you, from the project's chat. Example: *"Build me a Medieval Tavern in Blender, use Low Poly"*.

## What you need

- **Blender** (3.0 or newer), open on this PC.
- **Blender MCP** (free): the add-on `addon.py` from https://github.com/ahujasid/blender-mcp, and its MCP server, which the app starts with `uvx blender-mcp`.
- **uv** (it runs the MCP server): https://docs.astral.sh/uv/ — after installing, `uvx --version` works in a terminal.
- The [[Chat|Feature-Chat]] feature in the project, and Claude CLI signed in.

## Connect Blender

1. Download `addon.py` from the Blender MCP page.
2. In Blender: **Edit → Preferences → Add-ons → Install…**, choose `addon.py`, tick **Interface: Blender MCP**.
3. In Blender's 3D view press **N** → tab **BlenderMCP** → **Connect to Claude**. Keep Blender open.

## Switch it on

1. Open the project → **gear (Manage project)** → section **MCP**.
2. Tick **Blender**. The app writes `programs:` into `project.yaml`:

   ```yaml
   programs:
     - blender
   ```

3. Open the **Chat** tab and write what you want. The app gives Claude the Blender MCP and tells it to keep
   the `.blend` files and exports in the folder **`blender/`** of your project.

Claude asks before it uses the Blender tools (unless the chat's `permissions:` say otherwise).

## Example for the chat

> Build me a Medieval Tavern in Blender, use Low Poly

Claude works in Blender; the files land in `blender/` of your project. The app itself shows no extra screen for it.

## If it doesn't work

- Blender (or its MCP part) is not open/connected → the Blender tools answer with an error in the chat. Connect it and ask again.
- `uvx` / the program is not found → install it (see *What you need*) and start Workspace again.
- Blender MCP lets Claude run Python code inside Blender — it can do anything Blender can do on your PC. Allow its tools only in chats you trust.

See also: [[About MCP|MCP]] · [[Chat|Feature-Chat]]
