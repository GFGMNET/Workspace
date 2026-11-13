<#
.SYNOPSIS
  Copies the Documents folder to the NAS.
#>
param(
  [string]$Source = "$env:USERPROFILE\Documents",
  [string]$Target = "\\192.168.1.20\backup\$env:COMPUTERNAME"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Target)) { New-Item -ItemType Directory -Path $Target | Out-Null }
robocopy $Source $Target /MIR /R:2 /W:5 /NP /LOG:"$Target\backup.log"
Write-Host "Backup finished: $Target"
