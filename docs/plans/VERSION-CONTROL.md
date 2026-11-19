# Plan: Versions (Git, then SVN) — version 1.0.1

Issue #60 · status: **waiting for your answers (§7)**

## 1. Goal
In a project's **Versions** tab, without a terminal: see what changed, save a version, see the history, get an old version back,
and sync with a shared folder or your own server (IP address + port). First Git, then SVN.
**Done when** the automatic tests pass on Windows and Linux and you have tested it by hand.

## 2. Steps
| Step | What | Who |
|---|---|---|
| A | Git on this PC: changes, save, history, restore, start a history | me |
| A✓ | Test with a copy of a real project | you |
| B | Git with others: clone, sync with a shared folder or your server, logins | me |
| B✓ | Test with a shared folder | you |
| C | SVN: checkout, save, history, update, restore | me |
| C✓ | Test | you |
| D | Release 1.0.1 | your OK |

## 3. Assumptions
| | Checked? |
|---|---|
| Git and an SVN command line client are installed on your PC (TortoiseSVN alone is not enough) | ❓ question 1 |
| The app can make Git safe against harmful settings hidden in a folder (see risk 1) | ✅ partly; rest in step A |

## 4. Risks and plan B
| Risk | Plan B |
|---|---|
| 1. A folder that already contains Git data (zip, USB stick, shared folder) hides settings that start programs | the app switches them off and checks the folder before first use |
| 2. Two people changed the same file | choose per file: keep mine / keep theirs; nothing is lost |
| 3. Git or SVN not installed | clear message with download link |
| 4. 1.0 waits for signing | build now, release with 1.0 |

## 5. Costs
No money. About 10 days of my work, about 1 hour of yours per test.

## 6. Depends on
Git and SVN installed by you · a server only if you want one · the release of 1.0.

## 7. Open questions
1. Is Git for Windows installed, and which SVN client do you use?
2. Build now and release together with 1.0 — OK?

## 8. Status
Plan ✅ · questions ⏳ · building: not started.

*Maybe later (not in this plan):* Claude suggests the version message, SVN file locking, badge on the project card, big-file support.
