# Plan: Signing with own certificate

## 1) Name

Signing with own certificate

## 2) Planned release version

0.9.1

## 3) Feasible? Checked per function, with the result

| part | desc | state | suggestion |
|---|---|---|---|
| Certificate | create an own certificate and store it in the repository (private key encrypted) | unchecked | check on GitHub's Windows machine with a test certificate |
| Windows | the build on GitHub signs `Workspace.exe` and `workspace-server.exe` with it | unchecked | check on GitHub's Windows machine |
| Updater | the app only accepts updates signed with this certificate | unchecked | check on GitHub's Windows machine |

Checked: 0 · Unchecked: 3 · Failed: 0

## 4) Description

Windows software is signed with an own certificate. The certificate is stored in the repository.

## 5) Open points, only about this feature

None.

## 6) Decisions, only about this feature

| id | decision |
|---|---|
| 1 | Own (self-made) certificate instead of a bought one (2026-11-19). |
| 2 | The certificate is in the repository; its private key is encrypted, the password is in GitHub's secrets. |

## 7) Risks

| id | risk | suggestion |
|---|---|---|
| 1 | Windows SmartScreen and virus scanners still warn, unless the certificate is installed on the PC. | The release page explains how to install the certificate. |
| 2 | If the password leaks, anyone can sign as "Workspace". | Long random password, only in GitHub's secrets. |

## 8) Detail workflow

Written after the checks.
