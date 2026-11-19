# Check for docs/plans/SIGNING.md, point 3: own certificate, stored in the repository (key encrypted), signing on GitHub,
# and what the 1.0 updater can check. Uses a throwaway test certificate. Usage (Windows, PowerShell 7):
#   pwsh docs/plans/checks/signing-check.ps1 -Exe <path to an .exe to sign>
param([Parameter(Mandatory)][string]$Exe)
$ErrorActionPreference = 'Stop'
$fails = 0
function Res($ok, $msg) { if ($ok) { "ok    $msg" } else { "FAIL  $msg"; $script:fails++ } }
$T = Join-Path ([IO.Path]::GetTempPath()) ("sign-" + [guid]::NewGuid()); New-Item -ItemType Directory $T | Out-Null
$pass = [Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Max 256) }))   # in real use: from GitHub secrets
$sec = ConvertTo-SecureString $pass -AsPlainText -Force

# 1) create the certificate and the files that go into the repository
$c = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Workspace' -KeyAlgorithm RSA -KeyLength 3072 `
      -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(10)
Export-PfxCertificate -Cert $c -FilePath "$T\workspace-signing.pfx" -Password $sec | Out-Null   # private key, encrypted
Export-Certificate   -Cert $c -FilePath "$T\workspace-signing.cer" | Out-Null                   # public part
Remove-Item "Cert:\CurrentUser\My\$($c.Thumbprint)"                                             # nothing stays on the machine
Res ((Test-Path "$T\workspace-signing.pfx") -and (Test-Path "$T\workspace-signing.cer")) "certificate created (public part + encrypted private key)"
$opened = $true; try { New-Object Security.Cryptography.X509Certificates.X509Certificate2("$T\workspace-signing.pfx", 'wrong-password') | Out-Null } catch { $opened = $false }
Res (-not $opened) "the key file in the repository cannot be opened without the password"
$thumb = (New-Object Security.Cryptography.X509Certificates.X509Certificate2("$T\workspace-signing.cer")).Thumbprint
"info  thumbprint (would be built into the updater): $thumb"

# 2) sign like the GitHub build will
$signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe | Where-Object FullName -match 'x64' | Select-Object -Last 1
Copy-Item $Exe "$T\Workspace.exe"
& $signtool.FullName sign /f "$T\workspace-signing.pfx" /p $pass /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 "$T\Workspace.exe" | Out-Null
Res ($LASTEXITCODE -eq 0) "Workspace.exe signed on the build machine (with timestamp)"
$s = Get-AuthenticodeSignature "$T\Workspace.exe"
"info  what Windows says about the signature: Status=$($s.Status) ($($s.StatusMessage))"
Res ($s.SignerCertificate.Thumbprint -eq $thumb) "the signature is from our certificate"
Res ($null -ne $s.TimeStamperCertificate) "the signature has a timestamp (stays valid after the certificate expires)"

# 3) what the updater can check: our certificate + file not changed
function UpdaterAccepts($file) {
  $x = Get-AuthenticodeSignature $file
  ($x.Status -ne 'HashMismatch') -and ($x.Status -ne 'NotSigned') -and ($x.SignerCertificate.Thumbprint -eq $thumb)
}
Res (UpdaterAccepts "$T\Workspace.exe") "updater accepts the real update"
Copy-Item "$T\Workspace.exe" "$T\changed.exe"; $b = [IO.File]::ReadAllBytes("$T\changed.exe"); $b[1000] = $b[1000] -bxor 0xFF; [IO.File]::WriteAllBytes("$T\changed.exe", $b)
"info  changed file: Status=$((Get-AuthenticodeSignature "$T\changed.exe").Status)"
Res (-not (UpdaterAccepts "$T\changed.exe")) "updater refuses a changed file"
$o = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Workspace' -CertStoreLocation Cert:\CurrentUser\My
Export-PfxCertificate -Cert $o -FilePath "$T\other.pfx" -Password $sec | Out-Null; Remove-Item "Cert:\CurrentUser\My\$($o.Thumbprint)"
Copy-Item $Exe "$T\fake.exe"; & $signtool.FullName sign /f "$T\other.pfx" /p $pass /fd SHA256 "$T\fake.exe" | Out-Null
Res (-not (UpdaterAccepts "$T\fake.exe")) "updater refuses a file signed by someone else with the same name 'Workspace'"
Copy-Item $Exe "$T\unsigned.exe"
Res (-not (UpdaterAccepts "$T\unsigned.exe") -or ((Get-AuthenticodeSignature $Exe).Status -ne 'NotSigned')) "updater refuses an unsigned file"

# 4) after installing the certificate on the PC (what the release page would explain)
Import-Certificate -FilePath "$T\workspace-signing.cer" -CertStoreLocation Cert:\CurrentUser\Root -ErrorAction SilentlyContinue | Out-Null
$s2 = Get-AuthenticodeSignature "$T\Workspace.exe"
"info  after installing the certificate on the PC: Status=$($s2.Status)"
Get-ChildItem Cert:\CurrentUser\Root | Where-Object Thumbprint -eq $thumb | Remove-Item -ErrorAction SilentlyContinue

"failed: $fails"
exit $fails
