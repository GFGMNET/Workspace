# Plan: Versions (Git, then SVN) — version 1.0.1

Issue #60 · status: **waiting for your answers at the end**

## What you get

Each project gets a **Versions** tab. In it you see which files changed since the last time, save the current state as a version
with a short message, look back at all earlier versions, and get an old version back if something went wrong — without a terminal.
If you want to share a project, it syncs with a shared folder or with your own server, which you set by IP address and port.
Git comes first, SVN after it. It costs no money.

## How it is built, step by step

**Step 1 — Git on your PC (me, about 4 days).**
The tab shows the changes, saves versions, shows the history and restores old versions (as a new version, so nothing is lost).
*Risk:* a folder that already contains Git data — for example from a zip file or a USB stick — can hide settings that start a
program as soon as Git looks at it. *What I do:* the app switches those settings off for every command and checks a folder the
first time it is used. If it finds something, it shows it and waits for you.
*Then you test it* with a copy of one of your projects (about 1 hour).

**Step 2 — Git with others (me, about 3 days).**
Cloning a project, and syncing with a shared folder or your own server. The login comes from your secrets, never saved in a file.
*Risk:* two people changed the same file. *What I do:* you choose per file "keep mine" or "keep theirs"; the other version is kept,
so nothing is lost.
*Then you test it* with a shared folder (about 1 hour). A server is not needed for this.

**Step 3 — SVN (me, about 3 days).**
The same functions for SVN: checkout, save, history, update, restore.
*Then you test it* (about 1 hour).

**Step 4 — Release.**
Version 1.0.1 comes out with your OK. *Risk:* 1.0.1 can only come after 1.0, and 1.0 for Windows is waiting for signing.
So it is built and tested now, and released together with 1.0.

## What you need on your PC

Git for Windows, and for SVN a command-line client (TortoiseSVN alone is not enough). If one is missing, the tab says so and shows
where to download it.

## Two questions before I start

1. Is Git for Windows installed, and which SVN program do you use?
2. Is it OK to build it now and release it together with 1.0?

*Maybe later, not part of this plan:* Claude suggests the version message, SVN file locking, a badge on the project card,
support for very big files.
