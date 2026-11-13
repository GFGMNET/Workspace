#!/bin/sh
# Project Workspace - starts the local app and opens it in your browser.
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js is needed: https://nodejs.org"; exit 1; }
(sleep 1; (xdg-open http://localhost:4321 || open http://localhost:4321) >/dev/null 2>&1) &
exec node app/server.js "$@"
