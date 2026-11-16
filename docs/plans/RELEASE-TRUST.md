# Plan: trusted releases

Status: **decided 2026-11-16** (one *Approve* click per release is fine) · Issues #49 (updates), #31 (Windows warning) · [REQUIREMENTS.md](../REQUIREMENTS.md) D22

History: a first attempt (a signing key on the maintainer's PC, scripts to sign every release) was removed on 2026-11-16: too many steps. A paid certificate was the second idea; this plan replaces it with something **free, without keys or files to look after, and one click per release at most**.

## 1. What we want

| Goal | Today |
|---|---|
| **A. Windows trusts the app**: no *Windows protected your PC* | the exe is unsigned |
| **B. Only genuine updates are installed** | the app trusts whatever is on the GitHub releases page |

## 2. The proposal: three small parts

### Part 1: protect the GitHub account (now, free, 15 minutes, once)

Whoever controls the GitHub account can publish releases, so this protects everything else.

- Two-factor login with a **passkey** or an authenticator app; recovery codes into your password manager.
- Repository → Settings → Branches: protect `main` (no force-push, no deletion).

### Part 2: free code signing for open-source projects (with version 1.0)

**SignPath Foundation** signs open-source projects' Windows programs for free. The project qualifies: MIT licence, public repository, built automatically by GitHub Actions.

How a release works then:

1. You start the release as today (*Run workflow*, or it starts by itself for security updates).
2. GitHub builds the program and sends it to SignPath.
3. You get an e-mail from SignPath and click **Approve** in your browser. That is the only extra step; their rules require a person to approve each release.
4. The signed program is published. Windows shows the publisher *SignPath Foundation* and no longer warns.

No certificate to buy, no key file, no hardware token, nothing on your PC. Maintenance: the yearly check of the project's details by SignPath (a form).

What the project has to do once: a short **Code signing policy** section in the README/wiki (who builds, who approves, privacy statement: the app only contacts GitHub for updates), and two-factor login for SignPath and GitHub (part 1).

**Why with 1.0 and not now:** SignPath only signs programs built from the project's own source code. Today's `ProjectWorkspace.exe` is Electron's program, renamed; the 1.0 program (Rust + Tauri) is built from our source. So 0.x stays unsigned.

### Part 3: the app checks updates by itself (with part 2)

- **Windows:** before installing, the updater checks the new `ProjectWorkspace.exe`: valid signature, publisher *SignPath Foundation*, product name *Project Workspace*. Otherwise the update is refused. No keys involved: Windows does the check.
- **Linux:** every package gets a GitHub **build attestation** (GitHub records which workflow built which file from which commit; free, automatic) and a checksum list. The updater checks the checksum; anyone can check the attestation with `gh attestation verify`.

## 3. What changes for you

| | Today | With the proposal |
|---|---|---|
| Start a release | 1 click (*Run workflow*) | the same |
| Per release | nothing | 1 click **Approve** in SignPath's e-mail |
| Automatic security releases | published by themselves | wait for that click |
| Keys, certificates, scripts | none | none |
| Cost | free | free |
| Windows warning | yes | gone (after Windows has seen the signed program a few times) |

## 4. Alternatives, if the approval click is too much

| | Cost | Per release | Windows warning |
|---|---|---|---|
| Stay unsigned (only part 1) | free | nothing | stays |
| Microsoft Azure Artifact Signing | about $10/month; in the EU only for registered companies | nothing (fully automatic) | gone |
| Classic certificate | a few hundred euros/year, key on a token or cloud service | depends | gone |

## 5. Steps and effort

| Step | When | Effort |
|---|---|---|
| Part 1: account protection | now, by you | 15 minutes |
| Apply at SignPath Foundation (form; they check the project) | before the 1.0 beta | 30 minutes + their review |
| Part 2: signing in the Windows build of 1.0, code signing policy page | phase 4 of the Rust plan | 1 day |
| Part 3: updater checks (Windows signature, Linux checksum + attestation) | phase 3 of the Rust plan | 1 day |

## 6. Decision (2026-11-16)

Approved: part 1 now (by the maintainer; **done 2026-11-16**), parts 2 and 3 with version 1.0 (SignPath Foundation, one *Approve* click per release; updater checks on Windows and Linux). 0.x stays unsigned.
