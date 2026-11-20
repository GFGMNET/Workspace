# Plan: Godot


## 1) Name

Godot

## 2) Planned release version

1.2.5

## 3) Feasible? Checked per function, with the result

| part | desc | state | suggestion |
|---|---|---|---|
| Project | MCP Godot is connected in a project | not checked — no checks for MCPs (decision 5) | — |
| Godot | the Claude CLI builds things in Godot through MCP | not checked — no checks for MCPs (decision 5) | — |

Checked: 0 · Unchecked: 2 (no checks for MCPs, decision 5) · Failed: 0

## 4) Description

In a project, MCP Godot is connected. Someone writes in the chat, e.g. "Build me a small medieval village level in Godot, use Low
Poly", and the Claude CLI does it in Godot through MCP. The app itself doesn't need to show feedback. (Same as the Blender plan;
the example sentence is Claude's.)

## 5) Open points, only about this feature

| id | question |
|---|---|
| 1 | There is no official Godot MCP, only community ones. Which one? **Godot AI** (add-on in the open Godot editor, 46 tools for scenes, nodes, scripts, signals, UI, materials…; needs **Godot 4.7+** and `uv`; MIT; https://github.com/hi-godot/godot-ai) — or **godot-mcp** (works through Godot's command line, fewer tools: scenes, nodes, sprites, run the project; any Godot 4, needs Node.js 18+; MIT; https://github.com/Coding-Solo/godot-mcp)? Claude's suggestion: Godot AI, because it works in the open editor like Blender, Unity and Unreal. |
| 2 | Which Godot version do you use? (Godot AI needs 4.7 or newer.) |

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | The name of an MCP is the name of the program it uses: "Godot". |
| 2 | For MCPs, the existing solution is used if possible (which one: open point 1). |
| 3 | No test phase for the MCP; instead a wiki article: what is needed and how to connect Godot and the app. |
| 4 | Switched on per project in `project.yaml`: `mcp:` with `godot` in it. |
| 5 | For MCPs only: no checks in point 3 and no test phase; an MCP plan can be Ready 2 Deploy without checks (2026-11-20). |
| 6 | Switching on in the app: project settings (gear) → section "MCP" with a checkbox per program, as in the [approved screen](img/mcp-settings.png); ticking writes `mcp:` in `project.yaml`. |
| 7 | No own beta for an MCP: it goes out with the release of its version (2026-11-20). |

## 7) Risks

| id | risk | suggestion |
|---|---|---|
| 1 | Not checked (decision 5): whether it works is only seen when it is used. | The wiki article says what is needed and how to connect (decision 3). |
| 2 | Only community solutions exist; they can change or stop. | Decision 2 ("if possible"): if it stops working, a new plan. |
| 3 | The MCP can change the Godot project (scenes, scripts). | The chat's permission questions stay on. |

## 8) Detail workflow

### 8b) The YAML file

```yaml
mcp:
  - godot
```

Rest written after the open points.
