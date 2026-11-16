# Skills

Agent skills for Claude: each skill is a `SKILL.md` file that tells Claude how to do a task. Claude CLI loads them automatically when it runs in the project folder (the **Chat** tab, or `claude` in a terminal).

| | |
|---|---|
| Stores | `markdown` |
| Layout | `pages` |
| Definition | `data/features/skills.yaml` |

## Add it to a project

```yaml
skills:
  - title: release
    description: Use this when asked to publish a new version.
```

Or click **+ Feature** in the project's tab row.

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Agent skills for Claude. Each skill is .claude/skills/<name>/SKILL.md
# Claude CLI loads them automatically when it runs in the project folder.
name: Skills
icon: puzzle
stores: markdown
layout: pages
for_claude: skills
new_item: Skill
aliases: [skils, skill]
```

## Settings

Every setting can also be set **for one project only**, under the feature key in that project's `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue | by layout |
| `folder` | Folder inside the project where the content goes | the key |
| `search` | Show the search box | true |
| `new_item` | Label of the **+ New** button | Skill |
| `aliases` | Other keys in project.yaml that mean this feature | none |
| `for_claude` | `skills`: store pages as `.claude/skills/<name>/SKILL.md` | `skills` |
| `folder` | | `.claude/skills` |

## Writing a skill

```markdown
---
name: release
description: Use this when asked to publish a new version.
---

# Release a new version

1. ...
```

The **description** decides when Claude uses the skill — write it as "Use this when …".

## On disk

```
projects/<project>/.claude/skills/
  release/
    SKILL.md
```

## Tips

- Also accepts the keys `skils` and `skill`.

See also: [[Features]] · [[Building Blocks|Building-Blocks]] · [[Projects]]
