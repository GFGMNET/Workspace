# VS Code and Explorer

## Explorer

Every project has an **Explorer** tab with all its files as a tree, including `project.yaml`, `.claude/` and `.mcp.json`. **Explorer** in the sidebar shows the whole workspace: all features and projects.

- **Viewing:** text files open in a code editor with syntax colours and line numbers (Tab indents, Ctrl+S saves). Markdown has a preview, and images are shown.
- **Managing files:** new file or folder, upload, rename or move, download, and delete. Deleted files go to `.trash`, so nothing is really lost.
- **YAML is checked:** a broken `project.yaml` or feature file is not saved, and the error names the line.

## Scripts

The **Scripts** feature is an explorer for the `scripts/` folder of a project. **+ Script** starts from a template: PowerShell, batch, Bash, Python, JavaScript, SQL, Markdown or text.

## Desktop VS Code

- **VS Code** in the project header opens the project folder in your installed VS Code.
- **Open in VS Code** on a file opens the folder and jumps to that file.
- This uses the `code` command. If nothing happens, make sure VS Code is installed with "Add to PATH", or set `VSCODE_COMMAND`.

## VS Code inside the app

The **VS Code** tab shows the full VS Code (extensions, terminal, Git) inside the app, opened on the project.

1. Click **Start VS Code**. The app runs `code serve-web` from your installed VS Code. The first start downloads its web part and needs internet once.
2. It runs on `127.0.0.1:8740` with a random access token, so other websites can't reach it.
3. It stops when the workspace stops.

To use **code-server** or **OpenVSCode Server** instead, change `data/settings.yaml`:

```yaml
ide:
  command: code-server --bind-addr 127.0.0.1:{port} --auth none --disable-telemetry
  port: 8740
  url: http://{host}:{port}/?folder={folder}
```

If the tab stays blank, your browser is blocking embedded pages. Use **Open in new window**.
