# Plan: OpenSCAD


## 1) Name

OpenSCAD

## 2) Planned release version

1.2.5

## 3) Feasible? Checked per function, with the result

| part | desc | state | suggestion |
|---|---|---|---|
| Project | MCP OpenSCAD is connected in a project | not checked — no checks for MCPs (decision 5) | — |
| OpenSCAD | the Claude CLI builds models in OpenSCAD through MCP and looks at the result | not checked — no checks for MCPs (decision 5) | — |

Checked: 0 · Unchecked: 2 (no checks for MCPs, decision 5) · Failed: 0

## 4) Description

Use the Claude CLI for OpenSCAD. In a project, MCP OpenSCAD is connected; the MCP lets Claude see what it built (pictures of the
model) and fix it — chosen by the maintainer over "no MCP" for that reason. E.g. "Build me a wall bracket for a 30 mm pipe in
OpenSCAD, ready for 3D printing" (the example sentence is Claude's). The app itself doesn't need to show feedback.

## 5) Open points, only about this feature

| id | question |
|---|---|
| 1 | Which existing OpenSCAD MCP (all free, MIT, none official)? **openscad-mcp** (uses the OpenSCAD on your PC; pictures from several sides, export STL/3MF, checks for errors and printability; needs OpenSCAD 2021.01+ and `uv`; started with `uvx openscad-mcp`) — or **openscad-mcp-server** (renders in Docker; pictures from 8 sides, STL; needs Docker running and Python 3.11+/`uv`)? Claude's suggestion: openscad-mcp, because it needs no Docker. |

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | The name of an MCP is the name of the program it uses: "OpenSCAD". |
| 2 | For MCPs, the existing solution is used if possible (which one: open point 1). |
| 3 | No test phase for the MCP; instead a wiki article: what is needed and how to connect OpenSCAD and the app. |
| 4 | Switched on per project in `project.yaml`: `mcp:` with `openscad` in it. |
| 5 | For MCPs only: no checks in point 3 and no test phase; an MCP plan can be Ready 2 Deploy without checks (2026-11-20). |
| 6 | Switching on in the app: project settings (gear) → section "MCP" with a checkbox per program, as in the [approved screen](img/mcp-settings.png); ticking writes `mcp:` in `project.yaml`. |
| 7 | No own beta for an MCP: it goes out with the release of its version (2026-11-20). |

## 7) Risks

| id | risk | suggestion |
|---|---|---|
| 1 | Not checked (decision 5): whether it works is only seen when it is used. | The wiki article says what is needed and how to connect (decision 3). |
| 2 | Only community solutions exist; they can change or stop. | Decision 2 ("if possible"): if it stops working, a new plan. |

## 8) Detail workflow

### 8b) The YAML file

```yaml
mcp:
  - openscad
```

Rest written after open point 1.
