# Windows front end for signing.js. The desktop app's program has no console of its own, so it can't
# ask questions in this window; this script asks (password hidden) and passes the answers on.
#   signing.ps1 new-key [-KeyFile <path>]
#   signing.ps1 sign <SHA256SUMS.txt> [-KeyFile <path>] [-Yes]
param(
  [Parameter(Position = 0, Mandatory = $true)][ValidateSet('new-key', 'sign')][string]$Command,
  [Parameter(Position = 1)][string]$File,
  [string]$KeyFile = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'project-workspace-signing.key'),
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$js = Join-Path $here 'signing.js'
$exe = Join-Path $here '..\..\ProjectWorkspace.exe'

function Plain([Security.SecureString]$s) {
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
function Run([string[]]$a) {
  $env:PW_SIGN_OUT = [IO.Path]::GetTempFileName()
  try {
    if (Test-Path $exe) {
      $env:ELECTRON_RUN_AS_NODE = '1'
      $p = Start-Process -FilePath (Resolve-Path $exe) -ArgumentList (@("`"$js`"") + ($a | ForEach-Object { "`"$_`"" })) -NoNewWindow -Wait -PassThru
      $code = $p.ExitCode
    }
    elseif (Get-Command node -ErrorAction SilentlyContinue) { & node $js @a | Out-Null; $code = $LASTEXITCODE }
    else { Write-Host '  Neither ProjectWorkspace.exe (two folders up) nor Node.js was found.' -ForegroundColor Red; return 1 }
    Get-Content $env:PW_SIGN_OUT -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
    return $code
  }
  finally { Remove-Item $env:PW_SIGN_OUT -ErrorAction SilentlyContinue; Remove-Item Env:PW_SIGN_OUT -ErrorAction SilentlyContinue }
}

try {
  if ($Command -eq 'new-key') {
    if (Test-Path $KeyFile) { Write-Host "`n  $KeyFile already exists. Keep using it, or move it away first.`n" -ForegroundColor Yellow; exit 1 }
    Write-Host "`n  Creating the release signing key."
    Write-Host "  Choose a strong password (at least 12 characters). You need it for every release.`n"
    if ($null -eq $env:PW_SIGN_PASSWORD) {
      $p1 = Plain (Read-Host '  Password' -AsSecureString)
      $p2 = Plain (Read-Host '  Repeat  ' -AsSecureString)
      if ($p1 -ne $p2) { Write-Host "`n  The passwords are not the same.`n" -ForegroundColor Red; exit 1 }
      $env:PW_SIGN_PASSWORD = $p1
    }
    exit (Run @('new-key', $KeyFile))
  }
  else {
    if (-not $File -or -not (Test-Path $File)) { Write-Host "`n  Drag the SHA256SUMS.txt you downloaded from the draft release onto sign-release.cmd.`n" -ForegroundColor Yellow; exit 1 }
    Write-Host "`n  You are about to sign:`n"
    Get-Content $File | ForEach-Object { Write-Host "    $_" }
    Write-Host "`n  Only sign a release that you started yourself (Actions -> Release) and expect."
    if (-not $Yes) { $a = Read-Host '  Sign it? (yes/no)'; if ($a -notmatch '^(y|yes)$') { Write-Host "`n  Not signed.`n"; exit 1 } }
    if ($null -eq $env:PW_SIGN_PASSWORD) { $env:PW_SIGN_PASSWORD = Plain (Read-Host '  Password of the signing key' -AsSecureString) }
    exit (Run @('sign', $File, $KeyFile, '--yes'))
  }
}
finally { Remove-Item Env:PW_SIGN_PASSWORD -ErrorAction SilentlyContinue; Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
