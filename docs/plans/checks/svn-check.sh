#!/bin/sh
# Feasibility check for docs/plans/VERSION-CONTROL.md, section 3 (SVN). Runs everything in a temp folder.
# Needs svn, svnadmin, svnserve. Usage: sh docs/plans/checks/svn-check.sh
set -e
T=$(mktemp -d); cd "$T"
ok() { echo "ok  $*"; }
svn --version --quiet
R="file://$(pwd -W 2>/dev/null || pwd)/repo"
svnadmin create repo
svn checkout -q "$R" p && ok "S1 checkout from a shared folder"
cd p; echo a > f.txt; svn add -q f.txt; svn status | grep -q f.txt && ok "S2 show changed files"
svn commit -q -m v1 && echo b > f.txt && svn commit -q -m v2 && ok "S3 save a version with a message"
svn update -q; [ "$(svn log -q | grep -c '^r')" = 2 ] && ok "S4 history"
svn merge -q -r HEAD:1 . && svn commit -q -m "restore v1" && svn update -q
[ "$(cat f.txt)" = a ] && [ "$(svn log -q | grep -c '^r')" = 3 ] && ok "S5 restore as a new version (history kept)"
cd "$T"; svn checkout -q "$R" q
echo x > p/f.txt; svn commit -q -m mine p
echo y > q/f.txt; svn update -q --accept postpone q > /dev/null 2>&1 || true
svn status q | grep -q '^C' && ok "S6 same file changed on both sides is found"
svn resolve -q --accept mine-full q/f.txt && svn commit -q -m theirs q && svn update -q q
svn log -q -v q | grep -q '^r5' && ok "S7 keep mine, both stay in history"
printf '[general]\nanon-access = none\nauth-access = write\npassword-db = passwd\n' > repo/conf/svnserve.conf
printf '[users]\nalice = s3cret-XYZ\n' > repo/conf/passwd
svnserve -d --foreground --listen-host 127.0.0.1 --listen-port 3690 -r "$T" & P=$!; sleep 2
echo s3cret-XYZ | svn checkout -q --non-interactive --no-auth-cache --username alice --password-from-stdin svn://127.0.0.1:3690/repo w
echo z >> w/f.txt
echo s3cret-XYZ | svn commit -q -m server --non-interactive --no-auth-cache --username alice --password-from-stdin w && ok "S8 server by IP+port with login from secrets"
! grep -rq "s3cret-XYZ" "$T/w" "$HOME/.subversion" "$APPDATA/Subversion" 2>/dev/null && ok "S9 password is in no file"
echo wrong | svn update --non-interactive --no-auth-cache --username alice --password-from-stdin w 2>&1 | grep -qi "auth" && ok "S10 wrong login gives a clear message"
kill $P 2>/dev/null || true
echo "all SVN checks passed"
