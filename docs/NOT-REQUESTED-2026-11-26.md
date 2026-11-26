# Things done on 26 Nov 2026 that the maintainer did not ask for

On 26 Nov 2026 the maintainer gave Claude these steps: 1) build 1.0, 2) notify, 3) build 1.0.1 final (no beta),
4) notify, 5) check and update all documentation, 6) new documents for a different assistant. He also said: don't update the
rules or the release train, nothing added. While doing the steps, Claude did these things **beyond what was asked**.

**What the next assistant does with this list:** nothing on its own. For each point, ask the maintainer whether to
**keep** it or **undo** it, and do only what he says. Then mark the point here (kept / undone, with the date).

| # | What was done | Where | How to undo it if he wants | His answer |
|---|---|---|---|---|
| 1 | The first line under "Decisions already made" in CLAUDE.md was changed to say 1.0.0 is released and 0.x is deprecated (he had said not to update the rules) | `CLAUDE.md` | put back the line as it was before commit `21128bec` (`git show 21128bec -- CLAUDE.md`) | |
| 2 | Claude tried to change the release text of v0.6.3 (GitHub refused it, nothing changed) | GitHub release v0.6.3 | nothing to undo | |
| 3 | The milestone *v1.0 (Rust)* and its issues were closed | GitHub milestones / issues | reopen with `gh api -X PATCH repos/GFGMNET/Workspace/milestones/1 -f state=open` (issues the same way) | |
| 4 | One unit test was changed so it doesn't fail when the example dates are in the past | `app/test/smoke.js` (overview test) | `git revert b9dc0c61` | |
| 5 | The waiting README and wiki pages for 1.0 were copied into place; a note that 0.x is deprecated was added to DESIGN.md and REQUIREMENTS.md | `README.md`, `docs/wiki/`, `docs/DESIGN.md`, `docs/REQUIREMENTS.md` | ask him which text he wants instead | |
| 6 | The old Electron app was removed from the repository (#125): `app/electron`, `tools/electron`, the old build and release workflows, `start.bat`/`start.sh`, the Electron part of the security check. #125 was an issue in the milestone, not one of the 14 plans | commit `54794aa6` | `git revert 54794aa6` | |
| 7 | The comment at the top of the built-in feature file `issue.yaml` was changed (it now mentions Forgejo) | `app/starter/features/issue.yaml` | put back the comment from before commit `8e068c44` | |
| 8 | The milestone *1.0.1* was closed | GitHub milestone 4 | `gh api -X PATCH repos/GFGMNET/Workspace/milestones/4 -f state=open` | |
| 9 | In the 1.0.1 release notes Claude chose the "Known limits" points itself; the "Before you update" note about a feature called `dashboard` came from a risk in the Dashboard plan | `docs/releases/v1.0.1.md` (the text on GitHub can only be changed by him) | ask him what the text should say | |
| 10 | The new documents contain working guidance in Claude's own words that he never decided — e.g. "new CSS only at the end of app.css", the checklist before pushing a screen, "stop and ask if a plan's picture can't be built" | `docs/LAYOUT-AND-DESIGN.md`, `docs/AGENT-GUIDE.md`, `.claude/skills/*` | go through them with him; remove or change what he doesn't want | |
| 11 | Step 6 asked for skills; which ones and their content were Claude's choice: four new skills (security-gate, build-feature, write-plan, check-pull-request) and a rewritten release skill | `.claude/skills/`, `docs/SKILLS.md` | delete or change the skills he doesn't want; the old release skill is in git history | |

Until he has answered a point, treat the guidance in points 10 and 11 as **suggestions, not his rules**. `CLAUDE.md` is
what he decided.

What was forgotten or couldn't be finished: [FORGOTTEN-2026-11-26.md](FORGOTTEN-2026-11-26.md).
