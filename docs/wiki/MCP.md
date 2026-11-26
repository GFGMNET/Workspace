# MCP

MCP ("Model Context Protocol") lets Claude use other programs and services. In Workspace there are two kinds:

- **[[MCP connections|Feature-MCP]]** — your own list of MCP servers per project (the feature `mcp:`). The app writes
  them to `.mcp.json` in the project folder, and Claude CLI loads them in the Chat tab or in a terminal.
- **The Workspace MCP server** — lets Claude list, create and edit your projects from anywhere. See [[Claude]].

- **MCPs for programs** — ready-made connections to Blender, Unity, Unreal Engine, Godot, OpenSCAD and FreeCAD. Switch them
  on per project under the gear (⚙) → **Manage → MCP**, or in `project.yaml`:
  ```yaml
  programs: [blender, godot]
  ```
  The chat then can use these programs, and everything Claude makes with them is saved in the project, in the folder named
  after the program (`blender/`, `godot/`, …). Each program has its own page with what it needs and how to connect it:
  [[Blender|MCP-Blender]] · [[Unity|MCP-Unity]] · [[Unreal Engine|MCP-Unreal]] · [[Godot|MCP-Godot]] · [[OpenSCAD|MCP-OpenSCAD]] · [[FreeCAD|MCP-FreeCAD]]

## What you need

- [Claude CLI](https://docs.claude.com/en/docs/claude-code) installed and signed in.
