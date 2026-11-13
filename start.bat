@echo off
rem Project Workspace - starts the local app; it opens your browser as soon as it is ready.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed: https://nodejs.org  ^(LTS^)
  pause
  exit /b 1
)
set PW_LAUNCHER=loop
node app\server.js --open %*
:again
if not "%errorlevel%"=="75" goto end
echo Restarting after the update...
node app\server.js %*
goto again
:end
pause
