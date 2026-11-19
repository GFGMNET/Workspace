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

1. The app uses the installed `git` and `svn` programs, no built-in copy.
2. "Restore" never deletes history: the old state is saved as a new version.
3. Logins come from the app's secrets, only while a command runs — never written into a file.
4. Server = shared folder, or own server by IP + port.

## 7) Risks

| Risk | Plan B |
|---|---|
| A copied project folder hides settings that start a program | The app switches them off for every command and warns (checked ✅). |
| Two people change the same file | You choose mine or theirs per file; both stay in the history (checked ✅). |
| SVN login on Windows does not work | Find the cause; if SVN cannot do it, SVN on Windows only with a shared folder. |
| 1.0 waits for signing | 1.0.1 waits too; the work is not lost. |

## 8) Detail workflow

**Step 1 — Git on your PC (me).** Tab with changes, save, history, restore.
Done when: the functions above work in the app; automatic tests pass on Windows + Linux; you tested it with a copy of a project.

**Step 2 — Git with others (me).** Shared folder, own server, login from secrets, mine/theirs.
Done when: the functions work in the app; tests pass on Windows + Linux; you tested it with a shared folder.

**Step 3 — SVN (me).** The same functions for SVN.
Done when: the functions work in the app; tests pass on Windows + Linux; you tested it with your SVN program.

**Step 4 — Release (you).** Docs updated, your OK, released together with or after 1.0.
