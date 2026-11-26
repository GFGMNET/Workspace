# MCP: Godot

Claude builds things in Godot for you, from the project's chat. Example: *"Build me a small medieval village level in Godot, use Low Poly"*.

## What you need

- **Godot 4.7** or newer, open with your project.
- **Godot AI** (free, MIT, https://github.com/hi-godot/godot-ai): the add-on in `addons/godot_ai/` of your Godot project.
- **uv** (it runs Godot AI's server; the app starts it with `uvx godot-ai attach`): https://docs.astral.sh/uv/
- The [[Chat|Feature-Chat]] feature in the project, and Claude CLI signed in.

## Connect Godot

1. Copy the Godot AI add-on into `addons/godot_ai/` of your Godot project (or install it from the Asset Library).
2. **Project → Project Settings → Plugins** → switch **Godot AI** on. Keep Godot open.

## Switch it on

1. Open the project → **gear (Manage project)** → section **MCP**.
2. Tick **Godot**. The app writes `programs:` into `project.yaml`:

   ```yaml
   programs:
     - godot
   ```

3. Open the **Chat** tab and write what you want. The app gives Claude the Godot MCP and tells it to keep
   the Godot project in the folder **`godot/`** of your project.

Claude asks before it uses the Godot tools (unless the chat's `permissions:` say otherwise).

## Example for the chat

> Build me a small medieval village level in Godot, use Low Poly

Claude works in Godot; the files land in `godot/` of your project. The app itself shows no extra screen for it.

## If it doesn't work

- Godot (or its MCP part) is not open/connected → the Godot tools answer with an error in the chat. Connect it and ask again.
- `uvx` / the program is not found → install it (see *What you need*) and start Workspace again.
- Godot AI is a community project (there is no official Godot MCP); it can change.

See also: [[About MCP|MCP]] · [[Chat|Feature-Chat]]
