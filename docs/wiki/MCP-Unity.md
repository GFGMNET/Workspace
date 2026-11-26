# MCP: Unity

Claude builds things in Unity for you, from the project's chat. Example: *"Build me a small medieval village scene in Unity, use Low Poly"*.

## What you need

- **Unity** 2021.3 or newer, open with your project.
- **MCP for Unity** (free, MIT, https://github.com/CoplayDev/unity-mcp — not made by Unity Technologies).
- **Python 3.10+** and **uv** (https://docs.astral.sh/uv/).
- The [[Chat|Feature-Chat]] feature in the project, and Claude CLI signed in.

## Connect Unity

1. In Unity: **Window → Package Manager → + → Add package from git URL…** and paste
   `https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#main`.
2. **Window → MCP for Unity** → start the server. It listens on `http://localhost:8080/mcp` (the app uses this address).
3. Keep Unity open.

## Switch it on

1. Open the project → **gear (Manage project)** → section **MCP**.
2. Tick **Unity**. The app writes `programs:` into `project.yaml`:

   ```yaml
   programs:
     - unity
   ```

3. Open the **Chat** tab and write what you want. The app gives Claude the Unity MCP and tells it to keep
   the Unity project in the folder **`unity/`** of your project.

Claude asks before it uses the Unity tools (unless the chat's `permissions:` say otherwise).

## Example for the chat

> Build me a small medieval village scene in Unity, use Low Poly

Claude works in Unity; the files land in `unity/` of your project. The app itself shows no extra screen for it.

## If it doesn't work

- Unity (or its MCP part) is not open/connected → the Unity tools answer with an error in the chat. Connect it and ask again.
- `uvx` / the program is not found → install it (see *What you need*) and start Workspace again.
- MCP for Unity lets Claude change scenes, scripts and assets of the open project.

See also: [[About MCP|MCP]] · [[Chat|Feature-Chat]]
