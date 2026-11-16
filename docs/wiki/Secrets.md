# Secrets

API keys, tokens and passwords don't belong in YAML files: those get copied, shared and put into git. Keep them under **Secrets** in the sidebar and refer to them by name.

## Save a secret

1. Click **Secrets** in the sidebar.
2. Enter a **name** (letters, digits, `-`, `_`, `.`), e.g. `github-token`, and the **value**.
3. **Save secret.** The value is never shown again. Use **Replace** to change it.

## Use it

Write `${secret:<name>}` wherever the value is needed.

**MCP connections** (headers, env, args, url):

```yaml
name: github
transport: http
url: https://api.githubcopilot.com/mcp/
headers:
  Authorization: Bearer ${secret:github-token}
```

The app writes `.mcp.json` with `${PW_SECRET_GITHUB_TOKEN}` instead of the value, so the key never lands in the project folder. The project's **Chat** starts Claude CLI with that variable filled in.

If you start `claude` yourself in a terminal, set the variable there (`set PW_SECRET_GITHUB_TOKEN=…` / `export PW_SECRET_GITHUB_TOKEN=…`), or use the chat in the app.

**Settings** in `data/settings.yaml`, e.g. the token for private GitHub repositories:

```yaml
github:
  token: ${secret:github-token}
```

## How they are kept

- Stored in `data/.secrets.json`, encrypted (AES-256-GCM).
- **Desktop app:** the key is protected by Windows (or the operating system) for your user. A copied `data` folder doesn't reveal the values. On another computer or user they can't be read: remove them and enter them again (see [[Backup]]).
- **With Node.js** (start.bat / start.sh): the key is stored next to the secrets. They are still out of your YAML files, but whoever has the `data` folder can read them. The dialog shows which protection is in use.
- The Explorer, VS Code tab and the workspace MCP server can't open `.secrets.json`.

See also: [[MCP|Feature-MCP]], [[Claude]].
