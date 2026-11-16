@echo off
rem Creates the release signing key (asks for a password). See signing.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0signing.ps1" new-key %*
echo.
pause
