#!/bin/sh
# Project Workspace - starts the local app; it opens your browser as soon as it is ready.
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js is needed: https://nodejs.org"; exit 1; }
export PW_LAUNCHER=loop
node app/server.js --open "$@"
code=$?
while [ $code -eq 75 ]; do
  echo "Restarting after the update..."
  node app/server.js "$@"
  code=$?
done
exit $code
