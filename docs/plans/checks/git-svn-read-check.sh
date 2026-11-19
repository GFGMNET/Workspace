#!/bin/sh
# Checks for docs/plans/VERSION-CONTROL.md, point 3: read access with login, Git and SVN.
# Sets up its own test servers in a temp folder (Git over http with password, SVN svnserve with password).
# Needs git, python3 (or PYTHON=python), svn, svnadmin, svnserve. Usage: sh docs/plans/checks/git-svn-read-check.sh
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); cd "$T"
FAILS=0
res() { if [ "$1" = 0 ]; then echo "ok    $2"; else echo "FAIL  $2"; FAILS=$((FAILS+1)); fi; }
win() { command -v cygpath > /dev/null; }
nat() { if win; then cygpath -m "$1"; else echo "$1"; fi; }
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never

# ---------- test content: 2 versions, a folder, a file changed twice ----------
git init -q src; mkdir src/docs
echo one > src/readme.txt; echo a > src/docs/notes.txt
git -C src add -A; git -C src commit -qm "first version"
echo two > src/readme.txt; git -C src commit -qam "second version"

# ---------- Git server: http on 127.0.0.1:8765, login alice / s3cret-XYZ ----------
git clone -q --bare src srv.git
git -C srv.git config uploadpack.allowFilter true
${PYTHON:-python3} "$HERE/version-control-server.py" "$T" > gitsrv.log 2>&1 & GP=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:8765/ && break; sleep 1; done

PW_USER=alice PW_PASS=s3cret-XYZ; export PW_USER PW_PASS
H='!f() { test "$1" = get && echo username=$PW_USER && echo password=$PW_PASS; }; f'
gx() { git -c core.fsmonitor=false -c core.hooksPath= -c credential.helper= -c credential.helper="$H" "$@"; }

# only the list of files and the history are downloaded; file contents come when a file is opened
gx clone -q --bare --filter=blob:none http://127.0.0.1:8765/srv.git cache.git 2> git-login.err
res $? "Git  log in to the server"
[ "$(gx -C cache.git ls-tree -r --name-only HEAD | sort | tr '\n' ' ')" = "docs/notes.txt readme.txt " ]
res $? "Git  see the list of files"
[ "$(gx -C cache.git show HEAD:readme.txt)" = two ]
res $? "Git  read a file"
[ "$(gx -C cache.git log --format=%s | tr '\n' '|')" = "second version|first version|" ]
res $? "Git  see the history"
[ "$(gx -C cache.git log --format=%s -- docs/notes.txt)" = "first version" ]
res $? "Git  see the history of one file"
! grep -rqs "s3cret-XYZ" cache.git
res $? "Git  password is in no file"
PW_PASS=wrong gx ls-remote http://127.0.0.1:8765/srv.git > /dev/null 2>&1
[ $? != 0 ]; res $? "Git  wrong login is refused"
kill $GP 2>/dev/null
[ -s git-login.err ] && { echo "--- git messages:"; cat git-login.err; }

# ---------- SVN server: svnserve on 127.0.0.1:3690, login alice / s3cret-XYZ ----------
svnadmin create svnrepo
printf '[general]\nanon-access = none\nauth-access = write\npassword-db = passwd\n' > svnrepo/conf/svnserve.conf
printf '[users]\nalice = s3cret-XYZ\n' > svnrepo/conf/passwd
git -C src archive HEAD~1 > first.tar; mkdir svnsrc; tar -xf first.tar -C svnsrc
svn import -q "$(nat "$T")/svnsrc" "file:///$(nat "$T" | sed 's#^/##')/svnrepo/trunk" -m "first version" --non-interactive 2> svn-import.err
svn checkout -q "file:///$(nat "$T" | sed 's#^/##')/svnrepo/trunk" wc && echo two-svn > wc/readme.txt && svn commit -q -m "second version" wc
svnserve -d --foreground --listen-host 127.0.0.1 --listen-port 3690 -r "$(nat "$T")" > svnserve.log 2>&1 & SP=$!
sleep 3
U=svn://127.0.0.1:3690/svnrepo/trunk
sv() { printf %s "$PW_PASS" | svn "$@" --non-interactive --no-auth-cache --username alice --password-from-stdin; }

sv info "$U" > /dev/null 2> svn-login.err
res $? "SVN  log in to the server"
[ "$(sv list -R "$U" | grep -v '/$' | sort | tr '\n' ' ')" = "docs/notes.txt readme.txt " ]
res $? "SVN  see the list of files"
[ "$(sv cat "$U/readme.txt")" = two-svn ]
res $? "SVN  read a file"
[ "$(sv log -q "$U" | grep -c '^r')" = 2 ]
res $? "SVN  see the history"
[ "$(sv log -q "$U/docs/notes.txt" | grep -c '^r')" = 1 ]
res $? "SVN  see the history of one file"
! grep -rqs "s3cret-XYZ" "$HOME/.subversion" "$APPDATA/Subversion" wc/.svn
res $? "SVN  password is in no file"
PW_PASS=wrong sv info "$U" > /dev/null 2>&1
[ $? != 0 ]; res $? "SVN  wrong login is refused"
kill $SP 2>/dev/null
for f in svn-import.err svn-login.err svnserve.log; do [ -s $f ] && { echo "--- $f:"; cat $f; }; done

echo "failed: $FAILS"
[ $FAILS = 0 ]
