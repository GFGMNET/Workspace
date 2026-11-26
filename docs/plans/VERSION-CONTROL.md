# Plan: Git/SVN integration

**Released in 1.0.1** (26 Nov 2026) · was **Ready 2 Deploy**


## 1) Name

Git/SVN integration

## 2) Planned release version

1.0.1 (all remaining plans in one version — maintainer's decision 2026-11-25; built from 27 Nov, released 5 days after the complete beta, or once 5 days later if a bug is reported in the test days)

## 3) Feasible? Checked per function, with the result

| part | desc | state | suggestion |
|---|---|---|---|
| Git http | log in to the server | ✅ checked, Windows + Linux | — |
| Git http | see the list of files | ✅ checked, Windows + Linux | — |
| Git http | read a file | ✅ checked, Windows + Linux | — |
| Git http | see the history | ✅ checked, Windows + Linux | — |
| Git http | see the history of one file | ✅ checked, Windows + Linux | — |
| Git https | log in to the server | ✅ checked, Windows + Linux | — |
| Git https | see the list of files | ✅ checked, Windows + Linux | — |
| Git https | read a file | ✅ checked, Windows + Linux | — |
| Git https | see the history | ✅ checked, Windows + Linux | — |
| Git https | see the history of one file | ✅ checked, Windows + Linux | — |
| Git ssh | log in to the server | ✅ checked, Windows + Linux | — |
| Git ssh | see the list of files | ✅ checked, Windows + Linux | — |
| Git ssh | read a file | ✅ checked, Windows + Linux | — |
| Git ssh | see the history | ✅ checked, Windows + Linux | — |
| Git ssh | see the history of one file | ✅ checked, Windows + Linux | — |
| SVN svn | log in to the server | ✅ checked, Windows + Linux | — |
| SVN svn | see the list of files | ✅ checked, Windows + Linux | — |
| SVN svn | read a file | ✅ checked, Windows + Linux | — |
| SVN svn | see the history | ✅ checked, Windows + Linux | — |
| SVN svn | see the history of one file | ✅ checked, Windows + Linux | — |
| SVN http | log in to the server | ✅ checked, Windows + Linux | — |
| SVN http | see the list of files | ✅ checked, Windows + Linux | — |
| SVN http | read a file | ✅ checked, Windows + Linux | — |
| SVN http | see the history | ✅ checked, Windows + Linux | — |
| SVN http | see the history of one file | ✅ checked, Windows + Linux | — |
| SVN https | log in to the server | ✅ checked, Windows + Linux | — |
| SVN https | see the list of files | ✅ checked, Windows + Linux | — |
| SVN https | read a file | ✅ checked, Windows + Linux | — |
| SVN https | see the history | ✅ checked, Windows + Linux | — |
| SVN https | see the history of one file | ✅ checked, Windows + Linux | — |
| Git https | ignore certificate errors (self-made server certificate) | ✅ checked, Windows + Linux | — |
| SVN https | ignore certificate errors (self-made server certificate) | ✅ checked, Windows + Linux | — |
| Git git:// | log in to the server | ❌ not feasible: git:// has no login, anyone can read | closed, not offered in the YAML |

Checked: 32 · Unchecked: 0 · Failed: 0 · Not feasible (closed): 1

Check: `docs/plans/checks/git-svn-read-check.sh` with own test servers and a login, run 2026-11-19 on GitHub, Windows + Linux: https://github.com/GFGMNET/Workspace/actions/runs/44542328396

## 4) Description

Read access to the files from the repository, to show them and their history, for Git and SVN.

## 5) Open points, only about this feature

None.

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | Server and port are set in the YAML file. |
| 2 | Git and SVN use a login. |
| 3 | The tab is called "Version Control". |
| 4 | The protocol is set in the YAML file. |
| 5 | The tab shows whatever folder `path` names (also for SVN). |
| 6 | The test servers for the checks (Git and SVN, with login) are set up by Claude on GitHub's Windows and Linux machines. |
| 7 | The login is stored in the app's secrets (YAML `user:` and `password:` / `key:` with `${secret:…}`). |
| 8 | Git downloads only the list of files and the history first; a file's content when the file is opened. |
| 9 | The Git copy is kept in the project folder. |
| 10 | Git settings that can start programs are switched off for every command. |
| 11 | The screen as in the approved screenshots: [files](img/vc-files.png), [history](img/vc-history.png). |
| 12 | https: certificate errors are ignored. |
| 13 | The name of the folder in the project doesn't matter (it stays in the project folder): `.version-control`. |

## 7) Risks

| id | risk | suggestion |
|---|---|---|
| 1 | With a very big Git repository, the first download takes long. | Only list + history are downloaded (decision 8). |
| 2 | Certificate errors are ignored: someone in the network could pretend to be the server and read the login. | Accepted with decision 12. |

## 8) Detail workflow

### 8a) Flow diagram

```mermaid
flowchart TD
  A[Open project, tab Version Control] --> B[App reads type, protocol, server, port, path, user from the YAML]
  B --> C[Password or key from the app's secrets]
  C --> D{type}
  D -->|git| E[First time: download list + history into the project folder; later: only the changes]
  D -->|svn| F[Ask the server directly]
  E --> G[Show files, a file, history, history of one file]
  F --> G
```

### 8b) The YAML file

Git:

```yaml
version-control:
  feature: version-control
  type: git
  protocol: https                # git: http, https or ssh
  server: 192.168.1.20
  port: 3000
  path: team/project.git         # which repository on the server
  user: alice
  password: ${secret:git-pass}   # http/https: password from the app's secrets
  # key: ${secret:git-key}       # ssh: private key from the app's secrets
```

SVN:

```yaml
version-control:
  feature: version-control
  type: svn
  protocol: svn                  # svn: svn, http or https
  server: 192.168.1.30
  port: 3690
  path: repos/project/trunk      # the folder that is shown
  user: alice
  password: ${secret:svn-pass}
```

### 8c) How it is done

| id | desc |
|---|---|
| 1 | New feature file `app/starter/features/version-control.yaml`: name "Version Control", layout `vcs`. |
| 2 | New file `rust/crates/pw-server/src/vcs.rs`: reads the settings from the YAML (decisions 1, 4, 5), takes password/key from the secrets (decision 7). Allowed protocols: git http/https/ssh, svn svn/http/https; anything else → error. |
| 3 | Git commands always with: `core.fsmonitor` and `core.hooksPath` off (decision 10), no saved logins, no questions on screen; password only while the command runs; ssh key via `ssh-agent` from stdin, never in a file; https with `http.sslVerify=false` (decision 12). |
| 4 | Git: first time `clone --bare --filter=blob:none` into the project folder, folder `.version-control` (decisions 8, 9, 13); later `fetch`. List = `ls-tree`, file = `show`, history = `log`, history of one file = `log -- <file>`. |
| 5 | SVN: `svn list -R`, `svn cat`, `svn log`, `svn log <file>`; always `--non-interactive --no-auth-cache --password-from-stdin`; https with `--trust-server-cert-failures=…` (decision 12). |
| 6 | Four new addresses in the app server: files, one file, history, history of one file (`/api/projects/{p}/f/{f}/vcs/...`). |
| 7 | New screen `VIEWS.vcs` in `app/public/views.js`, as in the approved screenshots (decision 11). |
| 8 | Automatic tests `tests/contract/vcs.test.js` with the same test servers as the check, run by `rust.yml` on Windows and Linux. Done when: all green. |
| 9 | Docs: DESIGN.md, REQUIREMENTS.md (→ wiki page "Requirements"), wiki page "Version Control", release notes `docs/releases/v1.0.1.md`. |
| 10 | You test it with your own Git and SVN server. Done when: you see files, a file, the history and the history of one file. |
| 11 | Release 1.0.1 with your OK. |
