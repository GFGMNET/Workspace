@echo off
rem Project Workspace: sign-release (runs with the app's own runtime, or Node.js)
set "PW=%~dp0..\..\ProjectWorkspace.exe"
if exist "%PW%" (
  set ELECTRON_RUN_AS_NODE=1
  "%PW%" "%~dp0signing.js" sign %*
) else (
  node "%~dp0signing.js" sign %*
)
echo.
pause
