# MCP

MCP ("Model Context Protocol") lets Claude use other programs and services. In Workspace there are two kinds:

- **[[MCP connections|Feature-MCP]]** — your own list of MCP servers per project (the feature `mcp:`). The app writes
  them to `.mcp.json` in the project folder, and Claude CLI loads them in the Chat tab or in a terminal.
- **The Workspace MCP server** — lets Claude list, create and edit your projects from anywhere. See [[Claude]].

Ready-made MCPs for programs (Blender, Unity, Unreal, Godot, OpenSCAD, FreeCAD) come with later versions. Each one gets
its own page here, with what it needs at the top and how to connect the program.

## What you need

- [Claude CLI](https://docs.claude.com/en/docs/claude-code) installed and signed in.
