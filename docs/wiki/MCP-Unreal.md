# MCP: Unreal

Claude builds things in Unreal for you, from the project's chat. Example: *"Build me a medieval market square in Unreal, use Low Poly"*.

## What you need

- **Unreal Engine 5.8** or newer, with Epic's own **Unreal MCP** plugin (it comes with the editor; Epic marks it *experimental*).
- The [[Chat|Feature-Chat]] feature in the project, and Claude CLI signed in.
- Written for Unreal Engine 5.8.

## Connect Unreal

1. In the Unreal Editor: **Edit → Plugins**, search **Unreal MCP** (`ModelContextProtocol`), switch it on, restart the editor.
2. It starts with the editor and listens on `http://127.0.0.1:8000/mcp` (the app uses this address). Keep the editor open.

## Switch it on

1. Open the project → **gear (Manage project)** → section **MCP**.
2. Tick **Unreal**. The app writes `programs:` into `project.yaml`:

   ```yaml
   programs:
     - unreal
   ```

3. Open the **Chat** tab and write what you want. The app gives Claude the Unreal MCP and tells it to keep
   the Unreal project in the folder **`unreal/`** of your project.

Claude asks before it uses the Unreal tools (unless the chat's `permissions:` say otherwise).

## Example for the chat

> Build me a medieval market square in Unreal, use Low Poly

Claude works in Unreal; the files land in `unreal/` of your project. The app itself shows no extra screen for it.

## If it doesn't work

- Unreal (or its MCP part) is not open/connected → the Unreal tools answer with an error in the chat. Connect it and ask again.
- `uvx` / the program is not found → install it (see *What you need*) and start Workspace again.
- Unreal MCP is experimental and can change between Unreal versions.

See also: [[About MCP|MCP]] · [[Chat|Feature-Chat]]
