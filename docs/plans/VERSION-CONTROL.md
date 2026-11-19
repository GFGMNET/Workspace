# Plan: Versions (Git, then SVN) — version 1.0.1

Issue #60 · Status: **not started — waiting for the 2 answers in section 6**

## 1. Goal — done when

A project can keep versions of its files, without a terminal and without GitHub. 1.0.1 is done when all checks in steps 1–4 are
ticked and you gave your OK to release.

## 2. Decisions that are fixed (do not discuss again while building)

| # | Decision | Why |
|---|---|---|
| D1 | Only for the Rust version (1.0.1). 0.x does not get it. | 0.x is replaced by 1.0. |
| D2 | The app uses the installed `git` and `svn` programs, no built-in copy. | Same behaviour as the tools you already know; nothing extra to sign. |
| D3 | It is a normal feature: `app/starter/features/versions.yaml` with its own tab, switched on per project like the others. | Same as Issues, Chat etc. |
| D4 | One project folder = one repository. The whole `data/` folder is never one repository. | Decided 2026-11-19. |
| D5 | "Restore" never deletes history: it saves the old state as a **new** version. | Nothing can be lost by a click. |
| D6 | Logins come from the app's secrets and are handed to git/svn only while a command runs. They are never written into `.git/config`, the server address or any project file. | Security rule in CLAUDE.md. |
| D7 | Server = shared folder, or a server by IP address + port. | Decided 2026-11-19. |
| D8 | If something in a step cannot be done, the builder stops and asks you. | No new design without you. |

## 3. What was checked before writing this plan

| Assumption | Checked? | How / result |
|---|---|---|
| A folder with existing Git data can start a program as soon as the app looks at it | ✅ checked | Tried it 2026-11-19: a hidden setting (`core.fsmonitor`) in the folder ran a program on a plain "show changes". |
| Switching that setting off for each command stops it | ✅ checked | Same test with the setting switched off: nothing ran. |
| A normal clone does not copy such settings | ✅ checked | Cloned the same folder: the setting was not copied. Only folders that come as a whole (zip, USB stick, copy) are a risk. |
| The GitHub build machines (Windows + Linux) have Git, so the tests can run there | ✅ known | Git is needed to check out the code, so it is always there. |
| The Linux build machine can install SVN for the tests | ⚠️ assumed | Checked in step 3, check 3.1. Plan B: run SVN tests only on Linux. |
| The Windows build machine has SVN | ❌ not checked | Checked in step 3, check 3.1. Plan B: install it in the test job; if that fails, SVN is tested on Windows only by you. |
| TortoiseSVN can work for the app | ✅ checked | Only if the option "command line client tools" is ticked when installing TortoiseSVN (it is off by default). |
| You have Git for Windows / an SVN program | ❓ open | Question 1 in section 6. |

## 4. Steps

### Step 1 — Git on your PC (me · estimate 4 days)

What gets built: the Versions tab with "changes", "save version", "history", "restore"; turning a project folder into a repository.

Done when:
- [ ] 1.1 In a project without versions, the tab shows a button "Start versions". After clicking it, the folder is a Git repository.
- [ ] 1.2 Change a file → the tab lists it as changed. Type a message, click "Save version" → it appears at the top of the history.
- [ ] 1.3 Pick an older version → "Restore" → the files are as they were **and** the history has one more entry (D5).
- [ ] 1.4 Safety: a test folder with the hidden program setting from section 3 → opening the tab runs nothing, and the tab shows a
  warning with the setting's name. The test is automatic (`tests/contract/versions.test.js`).
- [ ] 1.5 Git not installed → the tab says "Git is not installed" with the download link, nothing crashes.
- [ ] 1.6 All automatic tests pass on GitHub for Windows and Linux.
- [ ] 1.7 **You** test 1.1–1.3 and 1.5 with a copy of one of your projects (about 1 hour).

### Step 2 — Git with others (me · estimate 3 days)

What gets built: "get project from server" (clone), "sync" (send and get versions), login from the secrets.

Done when:
- [ ] 2.1 Shared folder as server: project A sends a version, project B gets it.
- [ ] 2.2 Server by IP + port with a login from the secrets: works, and the login is in **no** file afterwards (automatic test
  searches the project folder and `.git` for it) (D6).
- [ ] 2.3 Same file changed on both sides → sync stops, shows the file, you choose "keep mine" or "keep theirs" → afterwards both
  versions are still in the history.
- [ ] 2.4 Server not reachable / wrong login → a clear message, nothing in the folder changed.
- [ ] 2.5 All automatic tests pass on GitHub for Windows and Linux.
- [ ] 2.6 **You** test 2.1 and 2.3 with a shared folder (about 1 hour). A real server is not needed.

### Step 3 — SVN (me · estimate 3 days)

What gets built: the same tab for SVN projects: checkout, changes, save (commit), history, update, restore.

Done when:
- [ ] 3.1 SVN can be installed on the GitHub build machines (Linux, Windows). If not: plan B from section 3, written down here.
- [ ] 3.2 Checks 1.2, 1.3, 1.5, 2.2, 2.3 and 2.4 pass for SVN too (with an SVN test repository in a temp folder).
- [ ] 3.3 **You** test checkout, save and history with your SVN program (about 1 hour).

### Step 4 — Release (you)

- [ ] 4.1 Docs updated: DESIGN.md, REQUIREMENTS.md, wiki page "Versions", release notes `docs/releases/v1.0.1.md`.
- [ ] 4.2 Your OK to release. 1.0.1 comes after 1.0, and 1.0 for Windows waits for signing — so it is built and tested now and
  released together with 1.0 (question 2).

## 5. Risks

| Risk | What happens then (plan B) | Extra cost |
|---|---|---|
| A folder hides settings that start programs | Switched off for every command + warning (check 1.4). | none |
| Two people change the same file | Choose per file, both stay in history (check 2.3). | none |
| SVN not available on a build machine | Test SVN on the machine where it works; you test the rest (check 3.1). | ~1 hour of yours |
| 1.0 stays on hold (signing) | 1.0.1 waits too. Nothing of this work is lost. | none |

Costs: no money. Your time: about 3 hours of testing plus the release OK.

Not part of this plan (so nobody starts it): Claude writing the version message, SVN file locking, a badge on the project card,
very big files (Git LFS), versioning the whole `data/` folder.

## 6. Open questions — answer before step 1 starts

1. Is Git for Windows installed, and which SVN program do you use? (TortoiseSVN is fine if "command line client tools" was ticked.)
2. Is it OK to build it now and release it together with 1.0?
