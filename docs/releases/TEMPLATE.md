# How release notes are written (decided by the maintainer 2026-11-24)

Release notes are for **users**: they should understand what is new or different and how to use it — not just a list.
The README "Upcoming changes" table stays short; the release notes have the details. Plain words, short sentences.

Use this structure (leave out a section that would be empty, except *In short*):

```
# Workspace X.Y.Z

One or two sentences: what this version is about.

## In short                   ← REQUIRED, 3–6 short lines. The app's update window shows only this part,
                                with a link "Read all details on GitHub" to the full text below.
- **New:** …  · **Changed:** … · **Fixed:** … · anything the user must do before updating

## Before you update          ← only if the user must do something first (backup, a new requirement, a setting)

## What's new
### <Name of the new thing>
What it is and what it is good for (1–3 sentences).
**How:** where to click / what to write in the feature file, what you need (program, account, token as a secret).
Wiki: [Page](https://github.com/GFGMNET/Workspace/wiki/Page)   (#issue)

## What changed               ← things that now work differently; say if the user has to do anything ("nothing to do")

## Fixed                      ← each bug in one line: what went wrong, in the user's words (#issue)

## Security                   ← library updates and fixes, with their RUSTSEC/CVE id (#issue)

## Known limits               ← what doesn't work (yet)

## Questions or problems?
Open an issue on GitHub with the label **bug**: <https://github.com/GFGMNET/Workspace/issues>
```
