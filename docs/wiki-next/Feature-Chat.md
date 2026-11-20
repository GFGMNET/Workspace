# Chat

Chat with Claude CLI inside the project folder. Claude sees the project's files, skills and MCP connections, and — if allowed — creates and changes files; the app shows the changes right away.

## What you need

- [Claude CLI](https://docs.claude.com/en/docs/claude-code) installed and signed in (`claude` works in a terminal).
- An internet connection for Claude.

![Chat](https://raw.githubusercontent.com/GFGMNET/Workspace/main/docs/screenshots/chat.png)

| | |
|---|---|
| Stores | `chat` |
| Layout | `chat` |
| Definition | `data/features/chat.yaml` |

## Add it to a project

```yaml
chat:
  permissions: ask
```

Or click **+ Feature** in the project's tab row.

## The definition

This is the starter definition. Change it under **Features** in the app, or in the file, and every project that uses it follows.

```yaml
# Chat with Claude CLI, running inside the project folder.
# permissions: ask (Claude asks before changing files) | auto (may edit files) | read-only
# A project can override any of this, e.g.  chat: { permissions: auto }
name: Chat
icon: chat
stores: chat
layout: chat
permissions: ask
context: [wiki, knowledge]
```

## Settings

Every setting can also be set **for one project only**, under the feature key in that project's `project.yaml`.

| Setting | What it does | Default |
|---|---|---|
| `name` | Name shown on the tab | from the key |
| `icon` | Tab icon: book, lightbulb, image, folder, puzzle, plug, chat, kanban, calendar, users, map, diagram, contact, server, table, list, cards, file, terminal, issue | by layout |
| `folder` | Folder inside the project where the content goes | the key |
| `search` | Show the search box | false |
| `new_item` | Label of the **+ New** button | Chat |
| `aliases` | Other keys in project.yaml that mean this feature | none |
| `permissions` | `ask` — Claude asks in the chat before changing files or running commands (**Allow** · **Always allow in this chat** · **Don't allow**) · `auto` — may change files · `read-only` — only reads | `ask` |
| `allowed_tools` | Tools always allowed, e.g. `[Read, Grep, "Bash(git status)"]` | none |
| `context` | Features Claude should look at first, e.g. `[wiki, knowledge]` | none |
| `instructions` | Extra instructions sent with the first message | none |
| `model` | Claude model alias, e.g. `sonnet` | Claude CLI default |
| `folder` | Where conversations are saved | `chats` |

## Requirements

Claude CLI installed and signed in once (`claude` in a terminal). The chat shows the CLI version, or *Claude CLI not found*.

## How it works

Each message runs `claude -p` in the project folder (streamed), with `--resume` to continue the conversation and `--mcp-config .mcp.json` when the project has MCP connections.

## On disk

```
projects/<project>/chats/
  2026-11-16-summarise-this-project.json
```

## Tips

- Set permissions per project — e.g. `auto` for a scratch project, `read-only` for client data.

See also: [[Features]] · [[Building Blocks|Building-Blocks]] · [[Projects]]

## While Claude works
- You can go to another page while Claude answers. It keeps working; come back to the chat to see the answer so far and any question it is waiting for.
- **Stop** stops Claude.
- **Always allow in this chat** counts at once: Claude isn't asked again for that tool, not even later in the same answer (e.g. each website it reads).

