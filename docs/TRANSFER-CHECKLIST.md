# Moving the project to another assistant: checklist

State 26 Nov 2026. Everything an assistant needs is in the repository; this list covers what is **not** in the code.

## A. Only the maintainer can do these

| # | What | How | Done? |
|---|---|---|---|
| 1 | Give the new assistant **access to the GitHub repository** `GFGMNET/Workspace`: read and push code, run workflows (Actions), read and write issues | in the new tool's GitHub connection / token | |
| 2 | Tell it to **read `AGENTS.md` first**. Many tools read `AGENTS.md` by themselves (e.g. Codex, Cursor). Some read another file name (Gemini CLI: `GEMINI.md`; GitHub Copilot: `.github/copilot-instructions.md`) — then that file needs one line: "Read AGENTS.md first." | first message to the new assistant | |
| 3 | **Claude's access** to the repository stays until you remove it (GitHub → Settings → Applications / Integrations, and the GitHub connection in Claude). Your choice. | GitHub settings | |
| 4 | The two **release texts** on GitHub (v1.0.1 links, v0.6.3 "deprecated") — see [FORGOTTEN-2026-11-26.md](FORGOTTEN-2026-11-26.md) points 1–2 | GitHub → Releases → Edit | |
| 5 | Answer the open points in [NOT-REQUESTED-2026-11-26.md](NOT-REQUESTED-2026-11-26.md) (keep / undo) | with the new assistant | |

## B. For the new assistant: things that are not obvious

**Read order:** `AGENTS.md` → `CLAUDE.md` → `docs/HANDOVER.md` → `docs/NOT-REQUESTED-2026-11-26.md` →
`docs/FORGOTTEN-2026-11-26.md` → `docs/AGENT-GUIDE.md` → `docs/LAYOUT-AND-DESIGN.md` → `docs/SKILLS.md`.

### CLAUDE.md has an old timeline — don't act on it

CLAUDE.md still says: pre-flight check 26 Nov 12:00 with a code freeze, release 1.0 on 27 Nov 06:00, building 1.0.1 from
27 Nov 07:00. **That is over** — 1.0.0 and 1.0.1 were both released on 26 Nov 2026. Which lines are history and which rules
still apply: [HANDOVER.md](HANDOVER.md), section *Lines in CLAUDE.md that are history now*.

### Things named after Claude that apply to you

- **`CLAUDE.md`** holds the maintainer's rules and decisions. It is named for Claude but applies to **any** assistant.
- **`.claude/skills/*/SKILL.md`** are step lists (release, security gate, …). Claude loads them by itself; you read them
  yourself before the job — overview in `docs/SKILLS.md`.
- **Commit attribution:** Claude's commits end with "Co-Authored-By: Claude …" lines. Use your own tool's lines, or ask the
  maintainer what he wants.
- **"Claude's work environment"** in the docs (no crates.io, no GraphQL, releases only by workflow) describes Claude's limits.
  Check what applies to you. If you **can** build Rust locally: `cd rust && cargo build --release --locked` (Linux also needs
  the WebKitGTK 4.1 development packages); otherwise push and let `rust.yml` build.
- **Not to remove:** the app itself works with Claude CLI (the Chat tab, skills, MCP, the workspace MCP server). That is a
  feature of the product, not the assistant. Don't remove it because you are another model.

### The maintainer

- He writes in English (often quickly, with typos) and lives in Germany (time zone Europe/Berlin). Answer in plain, short English.
- He tests betas himself on his Windows PC, with testers of his own.
- He is upset when things are done that he didn't ask for, and when things are forgotten. Before you say "done", check
  it yourself against the facts (files, GitHub) — don't leave the checking to him.

### Running a plan's checks

`gh api -X POST repos/GFGMNET/Workspace/actions/workflows/plan-checks.yml/dispatches -f ref=main -f 'inputs[plan]=<name>'`
— names: all, git-svn, vscode, signing, glpi, dashboard, comfyui, lmstudio, help, forgejo, builtin, layouts, skills, opengame.
The scripts are in `docs/plans/checks/`. A new plan gets its own check and a new name in that workflow.

### Example projects

`app/starter/examples/` (home-lab, test, test-2, workspace-dev) are added when a user clicks *Add the example projects*.
*workspace-dev* uses `location: "{install}"` — the app managing its own folder.

### GitHub things you will see

| What | What it is | What to do |
|---|---|---|
| Repository secrets `GLPI_TOKEN`, `GLPI_APP_TOKEN` | used only by `plan-checks.yml` for the GLPI check against the maintainer's test server (`https://ticket.bbdi42.de`, user *Hermes*) | nothing; you can't read them, only use them in that workflow |
| Branch `rust-vendor` | made by `rust-vendor.yml`: the Rust crates, so an environment without crates.io can build offline | keep; run the workflow again when crates change |
| Branch `rust-lock-update` | made by `rust-lock-update.yml`: a new `rust/Cargo.lock` to take over into `main` | keep; it is overwritten each run |
| Branches `check/dashboard-meta`, `plans-pending`, `ticket-1.0`, `vscode-1.0.0.5`, `dependabot/github_actions/actions/upload-artifact-7` | old work branches; their work is already in `main` (or, for the Dependabot one, the pull request is closed) | **don't delete without the maintainer's OK** — ask if he wants them cleaned up |
| Milestones `1.0.2` … `1.0.5` | empty, for the next versions | use `1.0.2` for the next features |
| Labels | `bug`, `hiccup`, `security`, `security-check`, `enhancement`, `vote`, `idea`, `possible-duplicate`, `documentation`, … | only the maintainer sets `bug` / `hiccup`; never add or remove labels on his issues without his OK |
| Workflow charts `docs/workflow_*.md` | his own | never change |

### Local only (not in Git)

A working copy may contain `data/` (a client's data — **never touch, copy or commit**), `build/`, `.workspace/`, `.mcp.json`.
They are not part of the project.
