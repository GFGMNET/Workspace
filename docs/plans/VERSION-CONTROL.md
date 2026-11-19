# Plan: feature "versions" (Git, then SVN — local, shared folder or own server)

Version **1.0.1** (decided 2026-11-19; before: 1.2) · Issue #60 · [REQUIREMENTS.md](../REQUIREMENTS.md) W18 ·
Plan format: goal, steps, assumptions (checked or not), risks with plan B, costs, dependencies, open questions, status.

> This is about **your projects**. The tool's own repository on GitHub stays only for developing the app (decision W10).

## 1. Goal

Version history for a project, **without GitHub or any public service**: see what changed, save a version, look at the
history, get an old version back, and — if wanted — share it through a shared folder or your own server.

**Done when:**
- in the Versions tab of a project you can, without a terminal: see changes (with comparison), save a version with a message,
  see the history, open and restore an old version (as a new version, nothing is lost), start a history, clone a repository;
- sync works with a shared folder and with your own server, set by **IP address + port** (+ protocol, path), with *Test connection*;
- the same for SVN (checkout, update, commit, history, restore, lock);
- every command the app runs is safe against harmful settings hidden in a folder (§4, R1);
- automatic tests pass on Windows and Linux, and you have tested it by hand with a real folder (and later a real server).

**Not in scope:** branches and merging between branches, pull requests, a Git/SVN server in the app, putting the whole data folder
under version history (decided: only single projects).

## 2. How it looks

```yaml
# project.yaml
versions:
  feature: versions
  tool: git              # git | svn (found automatically if the folder already is a working copy)
  remote: none           # none | a shared folder (\\nas\git\website.git) | server (below)
  server:
    address: 192.168.1.20
    port: 3000           # e.g. 3000 Forgejo/Gitea, 443 HTTPS, 22 SSH, 3690 svnserve
    protocol: https      # https | http | ssh | svn
    path: team/website.git
    login: ${secret:git-token}   # token/password from Secrets; SSH uses your SSH key
```

The **Versions** tab: *Changes* (tick files, compare side by side) · *Save a version* (message; *Suggest message* by Claude, optional)
· *History* (who, when, message, files; open a file as it was; *Restore*) · *Sync* (Git pull/push, SVN update/commit) · *Lock* (SVN)
· a badge on the project card (*3 changes not saved* / *2 new versions on the server*). New project → *From a repository* /
*Start version history*.

## 3. Steps (who does what)

| Step | What | Who | Done when |
|---|---|---|---|
| 0 | Decide the open questions in §8 | **you** | answered |
| A | Git on this PC: detect `git`, status, changes + comparison, save a version, history, open/restore old versions, start a history, badge; **safety layer (§4)** | me | automatic tests green (Windows + Linux) |
| A✓ | Test A by hand on a copy of a real project | **you** | OK or issues |
| B | Git with others: clone *From a repository*, pull/push, shared folder, own server by IP/port, *Test connection*, logins (Secrets / SSH), conflicts | me | tests green (bare repository as "server" on the runners) |
| B✓ | Test B with a shared folder (and a server, if you have one then) | **you** | OK or issues |
| C | SVN: detect `svn`, checkout, status, commit, history, update, restore, lock/unlock | me | tests green (`svnadmin` + `svnserve` on the runners) |
| C✓ | Test C (needs an SVN server or a local SVN repository I set up for you) | **you** | OK or issues |
| D | Claude: *Suggest message*, MCP tools `project_status`, `project_history` | me | tests green |
| E | Docs (DESIGN, wiki page *Versions*, release notes 1.0.1) | me | written |
| F | Release 1.0.1 | **you**: OK | published |

Built in Rust (`pw-server`, module `vcs` with `git.rs` and `svn.rs` behind one interface), using the installed `git` / `svn`
programs with argument lists (never a shell), only inside the project's folder.

## 4. How it is kept safe

A folder that already contains Git data (from a zip, a shared folder, a USB stick, a synced cloud folder) can hide settings that make
Git **run programs** as soon as any Git command looks at the folder — no click needed ("GitSpawn", Sept. 2026, hit several AI coding
tools; `core.fsmonitor` is the documented case, `core.hooksPath`, `credential.helper`, external diff/merge tools are similar).
A normal clone does **not** copy these settings or hooks.

So the app:
1. runs every Git command with these settings switched off: `-c core.fsmonitor=false -c core.hooksPath=<empty folder>`, `--no-ext-diff`,
   `--no-textconv`, no pager, no editor (`GIT_TERMINAL_PROMPT=0`, `GIT_EDITOR=true`);
2. **checks the folder's own Git settings before the first use** (`git config --local --list`): if it finds anything that can run a
   program (fsmonitor, hooksPath, sshCommand, credential helper, pager, editor, gpg program, diff/merge/filter commands), the tab shows
   them and does nothing until you confirm;
3. never runs hooks itself; your own normal Git setup (global settings, Git Credential Manager) stays as it is;
4. logins: HTTPS token from Secrets is handed to Git through a short-lived helper of the app itself (`workspace-server askpass`,
   like the chat's permission helper), never written to a file or the URL; SSH runs with `BatchMode=yes` (no hidden prompts).

SVN has no hooks on the client side; the same rules for logins apply (`--non-interactive`, password from Secrets).

## 5. Assumptions

| Assumption | Checked? |
|---|---|
| A normal `git clone` does not copy hooks or the repository's settings | ✅ checked (Git docs; CSA research note) |
| Hidden settings in an existing folder can run programs on `git status` | ✅ checked (GitSpawn) — handled in §4 |
| Switching them off per command with `-c …` works | ✅ for `core.fsmonitor` (the fix the vendors shipped); others: **to test in step A** |
| TortoiseSVN alone is enough | ❌ wrong: it doesn't need or always include the `svn` command line; a CLI client is needed (e.g. SlikSVN, or TortoiseSVN with its optional command line tools) — **to confirm on your PC** |
| You have Git for Windows installed | ❓ not checked — open question |
| Git and SVN can be installed on GitHub's test machines | ❓ Git yes (preinstalled); SVN on Linux via apt (likely), on Windows **to test** |
| `GIT_ASKPASS` with the app as helper works with Git Credential Manager installed | ❓ to test in step B |
| Line endings: Git for Windows may convert them (setting chosen at install) | ✅ known; the app doesn't change your Git settings and shows when a file differs only by line endings |
| Effort figures (below) | ❓ estimates |

## 6. Risks and plan B

| # | Risk | Likely | Effect | Plan B |
|---|---|---|---|---|
| R1 | Harmful settings in a folder run a program | low (needs a prepared folder) | serious | §4: switched off + check before first use; tests with a prepared folder |
| R2 | Git/SVN not installed or too old | medium | tab can't work | clear message with the download link; minimum version checked (Git ≥ 2.45 for its security fixes — **to confirm**) |
| R3 | Conflicts (two people changed the same file) are hard for non-developers | medium (only with sharing) | stuck sync | simple choice per file: *keep mine / keep theirs / open both in VS Code*; nothing is lost (both versions kept) |
| R4 | Login prompts hang in the background | medium | sync never ends | no prompts at all (§4.4); time limit with a clear message |
| R5 | Big files (videos, CAD) make the history huge | medium | slow, full disk | warning over 50 MB; Git LFS if installed; for such projects SVN with locks is the better fit |
| R6 | Line endings: whole files look changed | medium on Windows | confusing | show "only line endings differ"; don't change settings without asking |
| R7 | No server to test against | certain (now) | step B/C server parts untested by you | shared folder works without a server; tests on GitHub use a local "server"; real server later |
| R8 | *Suggest message* sends your changes to Claude (Anthropic) | certain when used | privacy | off by default, per project on; text shown before sending |
| R9 | 1.0.1 can only come after 1.0, and 1.0 for Windows waits for signing | certain (today) | release waits | build and test now on a branch; ship together with 1.0 (Linux may come first) — **your decision** |
| R10 | Estimates wrong | medium | later | steps are small and tested one by one; you see progress after each |

## 7. Costs and dependencies

- **Money:** nothing (Git, SVN clients and the test servers are free).
- **Time (estimate, my work):** A 4–5 days · B 3 days · C 3–4 days · D 1 day · E ½ day. **Your time:** ~1 hour per test round (A✓, B✓, C✓).
- **Depends on others:** Git for Windows / an SVN command line client (installed by you); for servers: your server, if any;
  the release depends on 1.0 (signing, R9).

## 8. Open questions (for you, before step A)

1. **Build now, release later?** Build and test 1.0.1 now (separate branch), and release it right after 1.0 — or together with it?
2. **Git installed?** Is Git for Windows on your PC (`git --version` in a terminal)? And for SVN: which client do you use?
3. **Folders with existing Git data** (§4.2): show the found settings and wait for your OK — or refuse such folders completely?
4. **Conflicts** (R3): is *keep mine / keep theirs / open both in VS Code* enough?
5. **Suggest message by Claude** (R8): off by default — OK?
6. **SVN locking:** needed (Office/CAD files), or can SVN wait and Git come alone in 1.0.1?

## 9. Status

| Part | Status |
|---|---|
| Plan | ✅ rewritten 2026-11-19 in the new format (replaces the 2026-11-16 version for v1.2) |
| Open questions §8 | ⏳ waiting for you |
| Steps A–F | not started |

## Appendix: servers, smallest first

| Option | Setup | Good for |
|---|---|---|
| Shared folder / NAS (Git bare repository) | `git init --bare \\nas\git\website.git`; nothing to install on the NAS | 1–5 people |
| Forgejo / Gitea | one program (Windows, Linux, Docker), SQLite is enough | a team, web access |
| GitLab CE | Linux server/VM, 4+ GB RAM | larger teams |
| VisualSVN Server (Windows) / Apache + mod_dav_svn, svnserve (Linux) | installer / distribution package | central history, locks for Office/CAD |

Sources: [GitSpawn (Cloud Security Alliance)](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-coding-agent-git-config-rce-20260904-cs/) ·
[Git: hooks don't run during clone](https://googlers.googlesource.com/jrn/git/+/8db1e8743c0f1ed241f6a1b8bf55b6fef07d6751) ·
[gitcredentials](https://man7.org/linux/man-pages/man7/gitcredentials.7.html) · [TortoiseSVN and the command line](https://www.tortoisesvn.net/docs/release/TortoiseSVN_en/tsvn-cli.html) ·
[SlikSVN](https://sliksvn.com/download/)
