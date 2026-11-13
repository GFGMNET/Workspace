@echo off
rem Project Workspace - starts the local app and opens it in your browser.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed: https://nodejs.org  ^(LTS^)
  pause
  exit /b 1
)
start "" http://localhost:4321
node app\server.js %*
pause
