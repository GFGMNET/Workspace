# FAQ

**Do I need a database or a server?**
No. Node.js runs a small local app on your PC (`localhost`), and everything is files in `data/`.

**Can several people use it?**
Each person runs it on their own PC. You can share the `data` folder (OneDrive, a network drive), but two people editing the same file at the same moment can overwrite each other.

**Does it need internet?**
No, except for the Claude chat, the first start of the in-app VS Code, and MCP servers that are online.

**"Port 4321 is already in use"**
The workspace is already running. Open http://localhost:4321, or start a second one with `node app/server.js 4322`.

**The chat says "Claude CLI not found"**
Install Claude CLI and run `claude` once in a terminal to sign in. If it's installed somewhere unusual, set `CLAUDE_COMMAND` to its full path.

**The VS Code button does nothing**
The `code` command isn't on the PATH. Reinstall VS Code with *Add to PATH*, or set `VSCODE_COMMAND`.

**The VS Code tab stays blank**
Some browsers block embedded pages. Use **Open in new window**.

**My `project.yaml` won't save**
It has a YAML error; the message names the line. A common cause is indentation: list items need a `-` and the same number of spaces.

**I deleted something by mistake**
Look in `.trash` inside the project folder. Nothing is really deleted by the app.

**Where do I report a bug or suggest a feature?**
At [Issues](https://github.com/GFGMNET/Workspace/issues).
