# Plan: Git/SVN integration

## 1) Name

Git/SVN integration

## 2) Planned release version

1.0.1

## 3) Feasible? Checked per function, with the result

- Git – see the files: unchecked
- Git – see the history: unchecked
- SVN – see the files: unchecked
- SVN – see the history: failed

Checked: 0 · Unchecked: 3 · Failed: 1

## 4) Description

See the files from the repository and the history, for Git and SVN.

## 5) Open points, only about this feature

| id | question |
|---|---|
| 1 | Can Git show the files of a repository on a server (IP + port)? |
| 2 | Can Git show the history of a repository on a server (IP + port)? |
| 3 | Can SVN show the files of a repository on a server (IP + port)? |
| 4 | Why did the SVN server login fail on Windows, and can SVN show the history there? |

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | Server and port are set in the YAML file. |

## 7) Risks

| id | risk | suggestion |
|---|---|---|
| 1 | 1.0.1 can only come after 1.0, and 1.0 for Windows waits for signing. | Build and check 1.0.1 now, release it together with 1.0. |
| 2 | Git cannot show files of a server repository without first downloading a copy; a big repository takes long and uses disk space. | Download only the list of files and the history, not the file contents (to be checked with open points 1 and 2). |

## 8) Detail workflow

**Step 1 — Git on your PC (me).** Tab with changes, save, history, restore.
Done when: the functions above work in the app; automatic tests pass on Windows + Linux; you tested it with a copy of a project.

**Step 2 — Git with others (me).** Shared folder, own server, login from secrets, mine/theirs.
Done when: the functions work in the app; tests pass on Windows + Linux; you tested it with a shared folder.

**Step 3 — SVN (me).** The same functions for SVN.
Done when: the functions work in the app; tests pass on Windows + Linux; you tested it with your SVN program.

**Step 4 — Release (you).** Docs updated, your OK, released together with or after 1.0.
