# Plan: feature "versions" (Git or SVN, local or on your own server)

Status: **planned** · Issue #60 · [REQUIREMENTS.md](../REQUIREMENTS.md) W18

> Not to be confused with the earlier decision (W10): the **tool's own** repository on GitHub is only for developing the app.
> This feature is about **your projects**, and works without GitHub.

## 1. What works today

**Yes, you can manage a project with Git today:** clone it anywhere and point a project at it with `location:`. The example *Workspace (development)* does exactly that.

```yaml
# data/projects/website/project.yaml
name: Website
location: D:\Repos\website        # the clone; project.yaml stays in data/, the content is the clone
wiki:
  folder: docs
scripts:
  folder: scripts
```

Cloning *into* `data/projects/<name>/` works too, but then `project.yaml` sits inside the repository; `location:` keeps the two apart.
What's missing: the app doesn't show or do anything Git-related. You use Git in a terminal, VS Code or the VS Code tab.

## 2. Goal

Version history for a project **without needing GitHub or any public service**:

| Where the history lives | For | What you need |
|---|---|---|
| **Only on this PC** (Git, no remote) | history, undo, compare versions; one person | Git for Windows |
| **A shared folder / NAS** (Git "bare" repository on `\\nas\git\project.git` or `D:\…`) | a small team or a second PC, no server | Git + a network share |
| **Your own Git server**: Gitea / Forgejo (one small program), GitLab CE, Bitbucket Data Center, Azure DevOps Server | a team, web access, permissions | the server in your network |
| **Your own SVN server**: VisualSVN Server (Windows), Apache + mod_dav_svn, svnserve | central history, simple for non-developers, locking for binary files (Office, CAD) | an SVN command-line client (e.g. TortoiseSVN with command-line tools, SlikSVN) |
| GitHub / GitLab.com / Bitbucket | if you want; nothing special | Git |

Nothing leaves your network unless you choose such a server.

## 3. How it looks for the user

```yaml
# project.yaml
versions:
  feature: versions
  tool: git              # git | svn   (found automatically if the folder already is a working copy)
  remote: none           # none | the URL of your server or share, e.g. \\nas\git\website.git or https://svn.example.local/repos/website
```

The **Versions** tab:

- **Changes:** files changed since the last version, with a side-by-side comparison; tick what belongs to the new version.
- **Save a version** (commit) with a message. *Suggest message* asks Claude to describe the changes.
- **History:** list of versions (who, when, message, files); open any file as it was; **restore** a file or the whole project to an earlier version (as a new version, nothing is lost).
- **Sync** (when there is a remote): Git *pull/push*, SVN *update/commit*. Conflicts are shown with *Open in VS Code* to resolve them.
- **Lock** (SVN): lock a binary file while you work on it, so nobody overwrites it.
- A badge on the project card: *3 changes not saved as a version* / *2 new versions on the server*.

**New project → From a repository:** enter a Git or SVN URL (or a share path), pick a folder; the app clones / checks out and creates the project with `location:`.

**New project → Start version history:** `git init` (or `svnadmin create` for a local SVN repository) with a sensible ignore list (`.trash/`, chat histories if you like).

## 4. How it is built

- The installed **`git`** / **`svn`** command-line programs do the work, as Claude CLI and VS Code are used today; the app adds no Git or SVN library. *Not found* → a hint how to install them.
- Commands run with argument lists (never through a shell) and in the project's folder only.
- **Logins** stay where these tools keep them: Git Credential Manager (Windows), SVN's auth cache, SSH keys. Tokens for HTTPS can come from [Secrets](../wiki/Secrets.md). The app never stores passwords itself.
- Hooks of a cloned repository are not executed by the app unless they are Git's normal client hooks you set up yourself.
- `app/lib/vcs/` with `git.js` and `svn.js` behind one interface: `status`, `diff`, `commit`, `log`, `show(file, version)`, `restore`, `pull`/`update`, `push`, `lock`/`unlock`, `clone`/`checkout`, `init`.
- Large files: Git LFS if installed; otherwise a warning for files over 50 MB.
- MCP server: `project_status`, `project_history`; *commit* only after a confirmation in the app.
- Version 1.0 (Rust): the same CLI approach in `pw-server`; covered by the contract tests.

## 5. Testing

- Automated: a temporary Git repository and a local SVN repository (`svnadmin create`, `file://`) on the runners: init, change, commit, log, restore, clone, conflict.
- A bare repository as "server" (Git) and `svnserve` (SVN) on the runners for sync.
- By hand: your server (Gitea, SVN …).

## 6. Phases and effort

| Phase | What | Days |
|---|---|---|
| A | Git: status, changes with comparison, commit, history, open/restore older versions, init; badge | 4–5 |
| B | Git remotes: clone *From a repository*, pull/push, conflicts → VS Code; share/NAS and own servers | 3 |
| C | SVN: checkout, status, commit, log, update, restore, locks | 3–4 |
| D | Claude: *Suggest message*, MCP tools | 1 |

## 7. Questions

1. **Git, SVN, or both?** Which one would you use first?
2. Which **server**, if any: a network share, Gitea/Forgejo, GitLab, an SVN server you already have?
3. Should the **whole data folder** be versionable too (as a backup with history), or only single projects?
4. Build in 0.x now, or with 1.0 (Rust)? *Proposal: Git phase A now; it runs through the same CLI calls in both versions.*
