# Skills for assistants

Skills are short step-by-step instructions for jobs that come up again and again. They live in `.claude/skills/<name>/SKILL.md`.
Claude Code loads them by itself; **any other model: read the matching file before you start that job.**

| Skill | Use it when | File |
|---|---|---|
| `release` | publishing a version, a beta or an urgent fix | [.claude/skills/release/SKILL.md](../.claude/skills/release/SKILL.md) |
| `security-gate` | before every release, and when a version is built | [.claude/skills/security-gate/SKILL.md](../.claude/skills/security-gate/SKILL.md) |
| `build-feature` | building a feature (or upgrade) whose plan is Ready 2 Deploy | [.claude/skills/build-feature/SKILL.md](../.claude/skills/build-feature/SKILL.md) |
| `write-plan` | the maintainer asks for a new feature or an upgrade | [.claude/skills/write-plan/SKILL.md](../.claude/skills/write-plan/SKILL.md) |
| `check-pull-request` | someone else sent a pull request | [.claude/skills/check-pull-request/SKILL.md](../.claude/skills/check-pull-request/SKILL.md) |

## Not to be confused with

- **The app's Skills feature** (a tab in a project): it writes skills for Claude CLI into a *project* folder
  (`.claude/skills/<name>/SKILL.md` inside that project). That is a feature for users — wiki *Feature-Skills*.
- **Skills from the internet** (paste a link, install): an idea, **not planned** (maintainer, 2026-11-25). Only when he asks.

## Writing or changing a skill

- Same format as the files above: a `---` header with `name:` and `description:` (when to use it), then short steps.
- A skill only writes down how things are already decided (`CLAUDE.md`). It never adds a new rule; ask the maintainer first.
- Keep this table current.
