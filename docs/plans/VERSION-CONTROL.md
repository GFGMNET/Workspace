# Plan: Versions (Git, SVN)

## 1) Name

Versions — Git and SVN in the app (issue #60)

## 2) Planned release version

1.0.1 (comes after 1.0)

## 3) Feasible? Checked per function, with the result

Checked on 2026-11-19 with `docs/plans/checks/version-control-check.sh` (Git) and `svn-check.sh` (SVN), on GitHub's
Windows and Linux machines.

| Function | Git | SVN |
|---|---|---|
| Start versions in a project | ✅ Win + Linux | ✅ Win + Linux (checkout) |
| Show changed files | ✅ Win + Linux | ✅ Win + Linux |
| Save a version with a message | ✅ Win + Linux | ✅ Win + Linux |
| History | ✅ Win + Linux | ✅ Win + Linux |
| Restore an old version (history kept) | ✅ Win + Linux | ✅ Win + Linux |
| Share via a shared folder | ✅ Win + Linux | ✅ Win + Linux |
| Same file changed by two people: found, keep mine or theirs | ✅ Win + Linux | ✅ Win + Linux |
| Own server by IP + port, login from the app's secrets | ✅ Win + Linux | ✅ Linux · ❌ **Windows failed** — cause not known yet (maybe my test) |
| Password is in no file | ✅ Win + Linux | ✅ Linux · ❌ Windows not reached |
| Wrong login gives a clear message | ✅ Win + Linux | ✅ Linux · ❌ Windows not reached |
| Protection: a copied folder cannot start a program | ✅ Win + Linux | — (SVN has no such setting in the folder) |

## 4) Description

Each project gets a **Versions** tab. You see which files changed, save the current state as a version with a short message,
look at the history and get an old version back — without a terminal. A project can be shared through a shared folder or
your own server (IP + port). Git first, then SVN.

## 5) Open points, only about this feature

1. Is Git for Windows installed, and which SVN program do you use? (TortoiseSVN works only if "command line client tools" was
   ticked when installing.)
2. SVN server login on Windows failed in the check — has to be checked again before this function can be approved.

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
