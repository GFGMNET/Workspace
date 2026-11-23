# VS Code and Explorer

## Explorer

Every project has an **Explorer** tab with all its files as a tree, including `project.yaml`, `.claude/` and `.mcp.json`. **Explorer** in the sidebar shows the whole workspace: all features and projects.

- **Viewing:** text files open in a code editor with syntax colours and line numbers (Tab indents, Ctrl+S saves). Markdown has a preview, and images are shown.
- **Managing files:** new file or folder, upload, rename or move, download, and delete. Deleted files go to `.trash`, so nothing is really lost.
- **YAML is checked:** a broken `project.yaml` or feature file is not saved, and the error names the line.

## Scripts

The **Scripts** feature is an explorer for the `scripts/` folder of a project. **+ Script** starts from a template: PowerShell, batch, Bash, Python, JavaScript, SQL, Markdown or text.

## Desktop VS Code

- **Manage** (gear icon in the project header) → **Open in VS Code** opens the project folder in your installed VS Code.
- **Open in VS Code** on a file opens the folder and jumps to that file.
- This uses the `code` command. If nothing happens, make sure VS Code is installed with "Add to PATH", or set `VSCODE_COMMAND`.

## VS Code inside the app

The **VS Code** tab shows the full VS Code (extensions, terminal, Git) inside the app, opened on the project.

1. Open the tab: VS Code **starts by itself** — no button. Meanwhile the tab says *VS Code is starting…*. The app runs
   `code serve-web` from your installed VS Code; the first start downloads its web part once (needs internet, about 10–40 s),
   later it takes a few seconds. Then the tab shows **only the editor**. (From 1.0.1.)
   If VS Code is not installed, the tab says *VS Code is not installed* with a link to download it.
2. It runs on `127.0.0.1:8740` with a random access token, so other websites can't reach it. The app shows it **through its own address** (`/ide/`), so browsers treat it as part of the app and don't block it, and you don't need to change any browser settings.
3. It stops when the workspace stops.

To use **code-server** or **OpenVSCode Server** instead, change `data/settings.yaml`:

```yaml
ide:
  command: "code-server --bind-addr 127.0.0.1:{port} --auth none --disable-telemetry"
  port: 8740
  url: "{base}/?folder={folder}"
  strip_base: true      # code-server serves at its root
```
