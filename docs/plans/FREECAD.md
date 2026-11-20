# Plan: FreeCAD



## 1) Name

FreeCAD

## 2) Planned release version

1.2.6

## 3) Feasible? Checked per function, with the result

| part | desc | state | suggestion |
|---|---|---|---|
| Project | MCP FreeCAD is connected in a project | not checked — no checks for MCPs (decision 5) | — |
| FreeCAD | the Claude CLI builds parts in FreeCAD through MCP and looks at the result | not checked — no checks for MCPs (decision 5) | — |

Checked: 0 · Unchecked: 2 (no checks for MCPs, decision 5) · Failed: 0

## 4) Description

Like the other MCPs: in a project, MCP FreeCAD is connected. Someone writes in the chat, e.g. "Build me a mounting plate 80×40 mm
with four M4 holes in FreeCAD and export it as STL" (the example sentence is Claude's), and the Claude CLI does it in FreeCAD
through MCP. The app itself doesn't need to show feedback.

## 5) Open points, only about this feature

| id | question |
|---|---|
| 1 | Which existing FreeCAD MCP (both community)? **FreeCAD MCP** (simple: add-on in FreeCAD, "Start RPC Server", started with `uvx freecad-mcp`; create/edit objects, run Python, picture of the view, parts library; https://github.com/neka-nat/freecad-mcp) — or **FreeCAD Robust MCP** (150+ tools: sketches, pads, pockets, holes, fillets, export STEP/STL/3MF…; needs FreeCAD 1.0.2+ (1.1.4+ recommended), Python 3.11+, a one-time pairing; still "beta"; Apache-2.0; https://github.com/spkane/freecad-addon-robust-mcp-server)? Claude's suggestion: Robust MCP, because it can export STL itself and has real CAD steps — but it is more to set up. |
| 2 | Which FreeCAD version do you use? |

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | The name of an MCP is the name of the program it uses: "FreeCAD". |
| 2 | For MCPs, the existing solution is used if possible (which one: open point 1). |
| 3 | No test phase for the MCP; instead a wiki article: what is needed and how to connect FreeCAD and the app. |
| 4 | Switched on per project in `project.yaml`: `mcp:` with `freecad` in it. |
| 5 | For MCPs only: no checks in point 3 and no test phase; an MCP plan can be Ready 2 Deploy without checks (2026-11-20). |
| 6 | Switching on in the app: project settings (gear) → section "MCP" with a checkbox per program, as in the [approved screen](img/mcp-settings.png); ticking writes `mcp:` in `project.yaml`. |
| 7 | No own beta for an MCP: it goes out with the release of its version (2026-11-20). |
| 9 | Every result of the MCP is saved in the Workspace project (its folder) — for all MCPs (2026-11-20). |
| 10 | How: the app tells Claude in every chat with this MCP to keep the FreeCAD files (`.FCStd`) and exports in the folder `freecad/` of the project (approved 2026-11-20). |

## 7) Risks

Written after the open points.

## 8) Detail workflow

### 8b) The YAML file

```yaml
mcp:
  - freecad
```

Rest written after the open points.
