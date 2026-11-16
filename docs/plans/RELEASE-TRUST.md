# Plan: trusted releases

Status: **to decide** · Issues #49 (updates), #31 (Windows warning) · [REQUIREMENTS.md](../REQUIREMENTS.md) D22

A first attempt (a signing key on the maintainer's PC and scripts to sign each release by hand) was removed on 2026-11-16: too many steps, too easy to get wrong. This plan starts again from what you actually want to achieve.

## 1. Two different goals

| Goal | What you see today | What solves it |
|---|---|---|
| **A. Windows trusts the app** | *Windows protected your PC* when starting ProjectWorkspace.exe | a **code-signing certificate** for the exe (Authenticode) |
| **B. The app only installs genuine updates** | the app trusts whatever is published on the GitHub releases page | the updater checks *who made* the new version before installing it |

Both have one weak point in common: **the GitHub account**. Whoever controls it can publish releases. So the first step protects the account itself.

## 2. The plan, step by step

### Step 1: protect the GitHub account (now, free, about 15 minutes)

- Two-factor login with a **passkey** or an authenticator app; save the recovery codes in your password manager.
- Settings → *Sessions*: sign out devices you don't use.
- Repository → Settings → *Branches*: protect `main` (no force-push, no deletion).
- Repository → Settings → *Actions*: allow only the actions this repository uses.

This is the most important step: it protects against the realistic attack (a stolen password) for releases, code and wiki at once, without changing how releases work.

### Step 2: a signed Windows exe (removes the Windows warning; decide first, see §3)

The release workflow signs `ProjectWorkspace.exe` automatically with a code-signing certificate. Nothing changes for you: releases stay one click (*Run workflow*).

Then the **updater checks the signature** of the new exe before installing on Windows: same publisher name as the running app, valid signature, otherwise the update is refused. That covers goal B on Windows without any extra keys or steps.

### Step 3: the same check on Linux (with step 2)

The Linux packages get a checksum list, and GitHub's own build attestation (*artifact attestations*: GitHub records that this exact file was built by this workflow from this commit). The updater checks the checksum; anyone can verify the attestation with `gh attestation verify`.

### Not planned: a key only on your PC

It protects even against a fully taken-over GitHub account, but needs a manual signing step on your PC for every release, including the automatic security releases. Reconsider only if the app gets many users outside your own organisation.

## 3. Choosing the certificate (step 2)

| Option | Cost | Who can get it | Notes |
|---|---|---|---|
| **Microsoft Azure Artifact Signing** (formerly Trusted Signing) | about $10 per month | organisations in the EU/UK (with company registration); individuals only in the USA/Canada | Microsoft keeps the key; GitHub Actions supported; no hardware token |
| **Classic code-signing certificate** (OV) from a certificate authority | typically a few hundred euros per year | companies and, with some vendors, individuals | the key must live on a hardware token or a cloud key service; signing from GitHub then needs that cloud service |
| **Stay unsigned** | free | | Windows keeps warning; *More info → Run anyway* once per version |

## 4. Questions

1. Is GFGMNET a **registered company** (in the EU)? Then Azure Artifact Signing is the simplest route.
2. Budget: is about $10 per month acceptable, or should it stay unsigned for now?
3. Step 1 (protecting the account) can be done right away. Should I write a short checklist for it in the wiki?

## 5. Effort once decided

| Step | Days |
|---|---|
| 1. account protection checklist | — (you, 15 minutes) |
| 2. signing in the Windows build + updater check of the publisher | 1–2 (+ the certificate's identity check, which can take a few days) |
| 3. checksums + attestations, Linux check | 1 |
