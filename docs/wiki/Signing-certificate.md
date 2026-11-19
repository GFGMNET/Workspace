# Signing certificate

From version 0.9.1, the Windows programs of *Workspace* (`Workspace.exe`, `workspace-server.exe`) are signed with the
project's **own certificate** named "Workspace". It is made by the project itself, not bought, so Windows doesn't know it yet:
SmartScreen and some virus scanners warn until you trust it once.

**What it protects:** the app's updater only installs an update that is signed with exactly this certificate and was not
changed. A changed or foreign program is refused, even if it is called "Workspace".

## Trust the certificate (once per PC)

1. Download `workspace-signing.cer` from the [release page](https://github.com/GFGMNET/Workspace/releases) (or from the folder
   `signing/` in the repository).
2. Compare its fingerprint with the one on the release page: right-click the file → **Open** → tab **Details** → **Thumbprint**.
3. Open PowerShell **as administrator** and run (in the folder with the file):

   ```powershell
   Import-Certificate -FilePath .\workspace-signing.cer -CertStoreLocation Cert:\LocalMachine\Root
   Import-Certificate -FilePath .\workspace-signing.cer -CertStoreLocation Cert:\LocalMachine\TrustedPublisher
   ```

Afterwards Windows shows **Workspace** as the publisher. To undo it: `certlm.msc` → *Trusted Root Certification Authorities*
and *Trusted Publishers* → delete "Workspace".

Only trust it if the fingerprint matches the release page. Plan and checks: `docs/plans/SIGNING.md`.
