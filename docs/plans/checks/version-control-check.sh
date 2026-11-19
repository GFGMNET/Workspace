#!/bin/sh
# Feasibility check for docs/plans/VERSION-CONTROL.md, section 3. Runs everything in a temp folder.
# Needs git and python3. Usage: sh docs/plans/checks/version-control-check.sh
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); cd "$T"
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
g() { git -c core.fsmonitor=false -c core.hooksPath= "$@"; }
ok() { echo "ok  $*"; }

mkdir p && cd p && g init -q && ok "F1 start versions"
echo a > f.txt; g status --porcelain | grep -q f.txt && ok "F2 show changed files"
g add -A && g commit -qm v1 && echo b > f.txt && g commit -qam v2 && ok "F3 save a version with a message"
[ "$(g log --oneline | wc -l)" = 2 ] && ok "F4 history"
first=$(g rev-list --max-parents=0 HEAD); g checkout -q "$first" -- . && g commit -qm "restore v1"
[ "$(cat f.txt)" = a ] && [ "$(g log --oneline | wc -l)" = 3 ] && ok "F5 restore as a new version (history kept)"
cd "$T"

# F6 a folder with hidden settings that start a program
git init -q evil; printf '#!/bin/sh\ntouch "%s/ran"\nexit 1\n' "$T" > hook.sh; chmod +x hook.sh
git -C evil config core.fsmonitor "$T/hook.sh"
git -C evil status > /dev/null 2>&1 || true; [ -f ran ] && echo "    (without protection the program ran)"; rm -f ran
g -C evil status > /dev/null 2>&1; [ ! -f ran ] && ok "F6 protection: hidden program setting does not run"

g init -q --bare share.git; g -C p remote add origin "$T/share.git"; g -C p push -q origin HEAD:main 2>/dev/null
g clone -q -b main share.git q && ok "F7 shared folder: send and get a project"
echo x > p/f.txt; g -C p commit -qam mine; g -C p push -q origin HEAD:main 2>/dev/null
echo y > q/f.txt; g -C q commit -qam theirs
g -C q pull -q --no-rebase origin main > /dev/null 2>&1 || true
g -C q diff --name-only --diff-filter=U | grep -q f.txt && ok "F8 same file changed on both sides is found"
g -C q checkout --ours f.txt && g -C q add f.txt && g -C q commit -qm merged
g -C q log --oneline | grep -q mine && g -C q log --oneline | grep -q theirs && ok "F9 keep mine/theirs, both stay in history"

# F10-F12 own server by IP + port with a login (git over HTTP behind a password)
g init -q --bare srv.git; git -C srv.git config http.receivepack true
${PYTHON:-python3} "$HERE/version-control-server.py" "$T" & P=$!; sleep 1
# the login is handed over only while the command runs (like the app will do from its secrets)
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never PW_USER=alice PW_PASS=s3cret-XYZ
H='!f() { test "$1" = get && echo username=$PW_USER && echo password=$PW_PASS; }; f'
g -c credential.helper= -c credential.helper="$H" clone -q http://127.0.0.1:8765/srv.git w 2>/dev/null
echo a > w/f; g -C w add f; g -C w commit -qm v1; g -C w -c credential.helper= -c credential.helper="$H" push -q origin HEAD:main 2>/dev/null && ok "F10 server by IP+port with login from secrets"
! grep -rq "s3cret-XYZ" "$T/w" "$HOME/.git-credentials" 2>/dev/null && ok "F11 password is in no file of the project"
PW_PASS=wrong g -C w -c credential.helper= -c credential.helper="$H" push origin HEAD:main 2>&1 | grep -q "Authentication failed" && ok "F12 wrong login gives a clear message"
kill $P
echo "all checks passed ($T)"
