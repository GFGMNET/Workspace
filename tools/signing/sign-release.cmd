@echo off
rem Signs a release: drag SHA256SUMS.txt from the draft release onto this file. See signing.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0signing.ps1" sign %*
echo.
pause
