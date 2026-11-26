# Plan: Godot

**Released in 1.0.1** (26 Nov 2026) · was **Ready 2 Deploy**



## 1) Name

Godot

## 2) Planned release version

1.0.1 (all remaining plans in one version — maintainer's decision 2026-11-25; built from 27 Nov, released 5 days after the complete beta, or once 5 days later if a bug is reported in the test days)

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

None.

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | The name of an MCP is the name of the program it uses: "Godot". |
| 2 | For MCPs, the existing solution is used if possible: **Godot AI** (add-on in the open Godot editor + MCP server, free, MIT, https://github.com/hi-godot/godot-ai) — chosen by the maintainer 2026-11-20. |
| 3 | No test phase for the MCP; instead a wiki article: what is needed and how to connect Godot and the app. |
| 4 | Switched on per project in `project.yaml`: `programs:` with `godot` in it. |
| 5 | For MCPs only: no checks in point 3 and no test phase; an MCP plan can be Ready 2 Deploy without checks (2026-11-20). |
| 6 | Switching on in the app: project settings (gear) → section "MCP" with a checkbox per program, as in the [approved screen](img/mcp-settings.png); ticking writes `programs:` in `project.yaml`. |
| 7 | No own beta for an MCP: it goes out with the release of its version (2026-11-20). |
| 8 | Requirement: Godot 4.7 or newer (the maintainer uses 4.7). |
| 9 | Every result of the MCP is saved in the Workspace project (its folder) — for all MCPs (2026-11-20). |
| 10 | How: the app tells Claude in every chat with this MCP to keep the Godot project in the folder `godot/` of the project (approved 2026-11-20). |
| 11 | The key is `programs:` (not `mcp:`, which is already the feature "MCP" with the connections). The app treats `programs:` as a setting of the project, not as a feature (approved 2026-11-20). |

## 7) Risks

| id | risk | suggestion |
|---|---|---|
| 1 | Not checked (decision 5): whether it works is only seen when it is used. | The wiki article says what is needed and how to connect (decision 3). |
| 2 | Godot AI is a community project (no official Godot MCP exists); it can change or stop. | Decision 2 ("if possible"): if it stops working, a new plan. |
| 3 | Godot AI can change the Godot project (scenes, scripts, resources). | The chat's permission questions stay on. |
| 4 | Godot has to be open with the Godot AI plugin enabled, and `uv` installed; otherwise the Godot tools answer with an error. | The wiki article. |

## 8) Detail workflow

### 8a) Flow diagram

```mermaid
flowchart TD
  A[project.yaml: programs: godot] --> B[Chat: the app starts the Claude CLI]
  B --> C[The app adds the MCP server godot: Godot AI's server]
  C --> D[Claude CLI talks to the Godot AI plugin in the open Godot editor]
  D --> E[Godot builds what was asked]
```

### 8b) The YAML file

```yaml
programs:
  - godot
```

### 8c) How it is done

| id | desc |
|---|---|
| 1 | The app reads `programs:` from `project.yaml` (a list of names). |
| 1a | `programs:` is a setting of the project, not a feature: added to the project settings keys in `rust/crates/pw-core/src/workspace.rs` (META_KEYS), so it shows no tab (decision 11). |
| 1b | Project settings (gear): section "MCP" with a checkbox per known program (Blender, Unity, Unreal, Godot) — ticking adds or removes the name in `programs:` (decision 6). |
| 2 | Known MCPs in the app: `godot` → Godot AI's server, started the way Godot AI documents it for Claude Code (its dock → Configure → the generated command, `godot-ai attach` over stdio) (decision 2). Unknown names are ignored with a note in the chat. |
| 3 | `rust/crates/pw-server/src/chat.rs`: when a chat starts the Claude CLI, the known MCPs of the project are added to `--mcp-config`. |
| 3b | Same place: a note for Claude in the chat — keep the Godot project in the folder `godot/` of the project (decision 10); the app creates the folder. |
| 4 | **Required** — wiki article "MCP: Godot" (decision 3); Godot is only released with it: what is needed (Godot 4.7 or newer, the Godot AI add-on in `addons/godot_ai/`, `uv`), how to connect (Project → Project Settings → Plugins → Godot AI on, tick Godot in the project settings), what to write in the chat. Done when: the article is in `docs/wiki/` and linked in the sidebar. |
| 5 | Docs: DESIGN.md, REQUIREMENTS.md (→ wiki "Requirements"), release notes `docs/releases/v1.0.1.md`. |
| 6 | No own beta (decision 7): goes out with the release 1.0.1, with your OK. |
