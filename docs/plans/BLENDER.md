# Plan: Blender

## 1) Name

Blender

## 2) Planned release version

1.1

## 3) Feasible? Checked per function, with the result

| part | desc | state | suggestion |
|---|---|---|---|
| Project | MCP Blender is connected in a project | unchecked | see open point 1 |
| Blender | the Claude CLI builds things in Blender through MCP | unchecked | see open point 1 |

Checked: 0 · Unchecked: 2 · Failed: 0

## 4) Description

In a project, MCP Blender is connected. Someone writes in the chat, e.g. "Build me a Medieval Tavern in Blender, use Low
Poly", and the Claude CLI does it in Blender through MCP. The app itself doesn't need to show feedback.

## 5) Open points, only about this feature

| id | question |
|---|---|
| 1 | "Skip the test phase": does that mean only your own test at the end, or also the feasibility checks of point 3? The plan rules say an unchecked function can't be approved. |

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | The name of an MCP is the name of the program it uses: "Blender". |
| 2 | For MCPs, the existing solution is used if possible: "Blender MCP" (add-on in Blender + MCP server, https://github.com/ahujasid/blender-mcp). |
| 3 | No test phase for the MCP; instead a wiki article: what is needed and how to connect Blender and the app. |
| 4 | Switched on per project in `project.yaml`: `mcp:` with `blender` in it. |

## 7) Risks

Written after open point 1.

## 8) Detail workflow

### 8b) The YAML file

```yaml
mcp:
  - blender
```

Rest written after open point 1.
