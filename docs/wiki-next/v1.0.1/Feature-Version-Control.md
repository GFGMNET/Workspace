# Version Control

Shows the files and the history of a **Git** or **SVN** repository in a tab of the project. Read only: nothing is changed in the repository.

## What you need

- **Git** installed (for Git repositories) or **SVN** (`svn`, for SVN repositories). On Windows: [Git for Windows](https://git-scm.com/download/win) / [TortoiseSVN](https://tortoisesvn.net/) with the command line tools.
- The address of the server, the port and the path of the repository.
- A login if the repository needs one. The password (or the ssh key) goes into **Settings → Secrets**, never into `project.yaml`.

| | |
|---|---|
| Stores | `vcs` |
| Layout | `vcs` |
| Definition | `data/features/version-control.yaml` |

## Add it to a project

```yaml
version-control:
  type: git                      # git or svn
  protocol: https                # git: http, https or ssh · svn: svn, http or https
  server: 192.168.1.20           # name or address of the server
  port: 3000                     # optional
  path: team/project.git         # git: the repository · svn: the folder that is shown
  user: alice
  password: ${secret:git-pass}   # http / https / svn
  # key: ${secret:git-key}       # ssh: the private key
```

Or click **+ Feature** in the project's tab row and then fill in the settings in `project.yaml`.

## Using it

- **Files**: the folders and files on the left, the chosen file on the right with its last change. **History of this file** shows only the changes of that file.
- **History**: every change with its short id, message, changed files, author and date. Click a file name to open it.
- **Refresh** reads the newest state from the server (otherwise at most once a minute).
- If something is missing or wrong, the tab says what to set in `project.yaml`.

## On disk

For Git, the app keeps a small copy (file list and history, file contents are fetched when you open them) in the project folder:

```
projects/<project>/.version-control/version-control.git
```

The password is never written there: it is handed to Git or SVN only while a command runs. Self-made certificates on your own server (https) are accepted.

See also: [[Features]] · [[Secrets]] · [[Projects]]
