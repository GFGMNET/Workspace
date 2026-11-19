#!/bin/sh
# Checks for docs/plans/VERSION-CONTROL.md, point 3: read access with login, Git and SVN.
# Sets up its own test servers in a temp folder (Git over http with password, SVN svnserve with password).
# Needs git, python3 (or PYTHON=python), svn, svnadmin, svnserve. Usage: sh docs/plans/checks/git-svn-read-check.sh
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); cd "$T"
FAILS=0
res() { if [ "$1" = 0 ]; then echo "ok    $2"; else echo "FAIL  $2"; FAILS=$((FAILS+1)); fi; }
skip() { echo "UNCHECKED  $1 ($2)"; FAILS=$((FAILS+1)); }
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
res $? "Git http  log in to the server"
[ "$(gx -C cache.git ls-tree -r --name-only HEAD | sort | tr '\n' ' ')" = "docs/notes.txt readme.txt " ]
res $? "Git http  see the list of files"
[ "$(gx -C cache.git show HEAD:readme.txt)" = two ]
res $? "Git http  read a file"
[ "$(gx -C cache.git log --format=%s | tr '\n' '|')" = "second version|first version|" ]
res $? "Git http  see the history"
[ "$(gx -C cache.git log --format=%s -- docs/notes.txt)" = "first version" ]
res $? "Git http  see the history of one file"
! grep -rqs "s3cret-XYZ" cache.git
res $? "Git http  password is in no file"
PW_PASS=wrong gx ls-remote http://127.0.0.1:8765/srv.git > /dev/null 2>&1
[ $? != 0 ]; res $? "Git http  wrong login is refused"
kill $GP 2>/dev/null
[ -s git-login.err ] && { echo "--- git messages:"; cat git-login.err; }


# ---------- Git over https: same server with a test certificate on 127.0.0.1:8766 ----------
openssl req -x509 -newkey rsa:2048 -nodes -keyout tls.key -out tls.pem -days 2 -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1" > /dev/null 2>&1
${PYTHON:-python3} "$HERE/version-control-server.py" "$T" 8766 "$(nat "$T")/tls.pem" "$(nat "$T")/tls.key" > gitsrv-tls.log 2>&1 & GTP=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -sk -o /dev/null https://127.0.0.1:8766/ && break; sleep 1; done
if win; then SB="-c http.sslBackend=openssl"; else SB=""; fi
gt() { GIT_SSL_CAINFO="$(nat "$T")/tls.pem" gx $SB "$@"; }   # test certificate only; real servers: the PC's normal certificates
gt clone -q --bare --filter=blob:none https://127.0.0.1:8766/srv.git cache-tls.git 2> git-tls.err
res $? "Git https  log in to the server"
[ "$(gt -C cache-tls.git ls-tree -r --name-only HEAD | sort | tr '\n' ' ')" = "docs/notes.txt readme.txt " ]; res $? "Git https  see the list of files"
[ "$(gt -C cache-tls.git show HEAD:readme.txt 2>>git-tls.err)" = two ]; res $? "Git https  read a file"
[ "$(gt -C cache-tls.git log --format=%s | tr '\n' '|')" = "second version|first version|" ]; res $? "Git https  see the history"
[ "$(gt -C cache-tls.git log --format=%s -- docs/notes.txt)" = "first version" ]; res $? "Git https  see the history of one file"
! grep -rqs "s3cret-XYZ" cache-tls.git; res $? "Git https  password is in no file"
PW_PASS=wrong gt ls-remote https://127.0.0.1:8766/srv.git > /dev/null 2>&1; [ $? != 0 ]; res $? "Git https  wrong login is refused"
kill $GTP 2>/dev/null
for f in git-tls.err gitsrv-tls.log; do [ -s $f ] && { echo "--- $f:"; tail -5 $f; }; done

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
res $? "SVN svn  log in to the server"
[ "$(sv list -R "$U" | grep -v '/$' | sort | tr '\n' ' ')" = "docs/notes.txt readme.txt " ]
res $? "SVN svn  see the list of files"
[ "$(sv cat "$U/readme.txt")" = two-svn ]
res $? "SVN svn  read a file"
[ "$(sv log -q "$U" | grep -c '^r')" = 2 ]
res $? "SVN svn  see the history"
[ "$(sv log -q "$U/docs/notes.txt" | grep -c '^r')" = 1 ]
res $? "SVN svn  see the history of one file"
! grep -rqs "s3cret-XYZ" "$HOME/.subversion" "$APPDATA/Subversion" wc/.svn
res $? "SVN svn  password is in no file"
PW_PASS=wrong sv info "$U" > /dev/null 2>&1
[ $? != 0 ]; res $? "SVN svn  wrong login is refused"
kill $SP 2>/dev/null
for f in svn-import.err svn-login.err svnserve.log; do [ -s $f ] && { echo "--- $f:"; cat $f; }; done


# ---------- Git over ssh: own sshd on 127.0.0.1:2222, login = key from the secrets (handed over via stdin) ----------
SSHD=$(ls /usr/bin/sshd /usr/bin/sshd.exe /usr/sbin/sshd 2>/dev/null | head -1)   # on Windows the one from Git for Windows
if [ -n "$SSHD" ] || [ -n "$SSH_AUTH_KEYS" ]; then
  ssh-keygen -q -t ed25519 -N '' -f hostkey; ssh-keygen -q -t ed25519 -N '' -f userkey; ssh-keygen -q -t ed25519 -N '' -f otherkey
  if [ -n "$SSH_AUTH_KEYS" ]; then cat userkey.pub >> "$SSH_AUTH_KEYS"; echo "ssh server: given (port 2222)"; DP=""
  else
  cp userkey.pub authorized_keys; chmod 600 authorized_keys hostkey
  printf 'Port 2222\nListenAddress 127.0.0.1\nHostKey %s/hostkey\nAuthorizedKeysFile %s/authorized_keys\nPasswordAuthentication no\nStrictModes no\nPidFile %s/sshd.pid\nAcceptEnv GIT_PROTOCOL\n' "$(nat "$T")" "$(nat "$T")" "$(nat "$T")" > sshd_config
  echo "ssh server: $SSHD"; "$SSHD" -f "$T/sshd_config" -D -e > sshd.log 2>&1 & DP=$!; sleep 2
  fi
  KEY=$(cat userkey); OTHER=$(cat otherkey); rm -f userkey otherkey     # from here on the key exists only in the secrets
  eval "$(ssh-agent -s)" > /dev/null; printf '%s\n' "$KEY" | ssh-add - 2> /dev/null
  export GIT_SSH_COMMAND="ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o IdentitiesOnly=no -o BatchMode=yes"
  SU="ssh://$(whoami)@127.0.0.1:2222$T/srv.git"
  gx clone -q --bare --filter=blob:none "$SU" cache-ssh.git 2> git-ssh.err
  res $? "Git ssh  log in to the server"
  [ "$(gx -C cache-ssh.git ls-tree -r --name-only HEAD | sort | tr '\n' ' ')" = "docs/notes.txt readme.txt " ]; res $? "Git ssh  see the list of files"
  [ "$(gx -C cache-ssh.git show HEAD:readme.txt 2>>git-ssh.err)" = two ]; res $? "Git ssh  read a file"
  [ "$(gx -C cache-ssh.git log --format=%s | tr '\n' '|')" = "second version|first version|" ]; res $? "Git ssh  see the history"
  [ "$(gx -C cache-ssh.git log --format=%s -- docs/notes.txt)" = "first version" ]; res $? "Git ssh  see the history of one file"
  ! grep -rqs "PRIVATE KEY" cache-ssh.git; res $? "Git ssh  key is in no file"
  ssh-add -D > /dev/null 2>&1; printf '%s\n' "$OTHER" | ssh-add - 2> /dev/null
  gx ls-remote "$SU" > /dev/null 2>&1; [ $? != 0 ]; res $? "Git ssh  wrong login is refused"
  ssh-agent -k > /dev/null; [ -n "$DP" ] && kill $DP 2>/dev/null; unset GIT_SSH_COMMAND
  for f in git-ssh.err sshd.log; do [ -s $f ] && { echo "--- $f:"; tail -5 $f; }; done
else
  skip "Git ssh  all functions" "no ssh server program on this machine"
fi

# ---------- Git over git:// (git daemon): does it support a login? ----------
git -c core.fsmonitor=false daemon --reuseaddr --export-all --base-path="$T" --listen=127.0.0.1 --port=9418 > daemon.log 2>&1 & GDP=$!; sleep 2
git -c credential.helper= ls-remote git://127.0.0.1:9418/srv.git > /dev/null 2> git-daemon.err
if [ $? = 0 ]; then echo "NOT FEASIBLE  Git git://  log in to the server (anyone can read without a login; git:// has no login)"; FAILS=$((FAILS+1)); else res 1 "Git git://  server reachable"; fi
kill $GDP 2>/dev/null
for f in git-daemon.err daemon.log; do [ -s $f ] && { echo "--- $f:"; tail -5 $f; }; done

# ---------- SVN over http: Apache with mod_dav_svn (Linux) or a given server (SVN_HTTP_URL) ----------
APACHE=$(command -v apache2 || ls /usr/sbin/apache2 2>/dev/null | head -1)
HU=""
if [ -n "$SVN_HTTP_URL" ]; then HU="$SVN_HTTP_URL"
elif [ -n "$APACHE" ] && [ -f /usr/lib/apache2/modules/mod_dav_svn.so ]; then
  M=/usr/lib/apache2/modules; mkdir -p logs
  htpasswd -bc htpasswd alice s3cret-XYZ 2> /dev/null
  cat > httpd.conf <<CONF
ServerRoot $T
ServerName 127.0.0.1
Listen 127.0.0.1:8081
PidFile $T/httpd.pid
ErrorLog $T/logs/error.log
LoadModule mpm_event_module $M/mod_mpm_event.so
LoadModule authn_core_module $M/mod_authn_core.so
LoadModule authn_file_module $M/mod_authn_file.so
LoadModule authz_core_module $M/mod_authz_core.so
LoadModule authz_user_module $M/mod_authz_user.so
LoadModule auth_basic_module $M/mod_auth_basic.so
LoadModule dav_module $M/mod_dav.so
LoadModule dav_svn_module $M/mod_dav_svn.so
LoadModule ssl_module $M/mod_ssl.so
LoadModule socache_shmcb_module $M/mod_socache_shmcb.so
Listen 127.0.0.1:8443
<VirtualHost 127.0.0.1:8443>
  SSLEngine on
  SSLCertificateFile $T/tls.pem
  SSLCertificateKeyFile $T/tls.key
  <Location /svn>
    DAV svn
    SVNPath $T/svnrepo
    AuthType Basic
    AuthName test
    AuthUserFile $T/htpasswd
    Require valid-user
  </Location>
</VirtualHost>
<Location /svn>
  DAV svn
  SVNPath $T/svnrepo
  AuthType Basic
  AuthName test
  AuthUserFile $T/htpasswd
  Require valid-user
</Location>
CONF
  "$APACHE" -f "$T/httpd.conf" -k start 2> httpd.err; sleep 2
  HU=http://127.0.0.1:8081/svn/trunk; HSU=https://127.0.0.1:8443/svn/trunk
fi
TR="--trust-server-cert-failures=unknown-ca,cn-mismatch,expired,not-yet-valid,other"
sh_() { printf %s "$PW_PASS" | svn "$@" $TR --non-interactive --no-auth-cache --username alice --password-from-stdin; }
SEED="${SVN_HTTP_URL:-$SVN_HTTPS_URL}"
if [ -n "$SEED" ]; then   # given server is empty: put the same test content in (2 versions)
  sh_ import -q "$(nat "$T")/svnsrc" "$SEED" -m "first version" 2> svn-http-seed.err
  sh_ checkout -q "$SEED" wc2 2>> svn-http-seed.err && echo two-svn > wc2/readme.txt && sh_ commit -q -m "second version" wc2 2>> svn-http-seed.err
  [ -s svn-http-seed.err ] && { echo "--- svn-http-seed.err:"; cat svn-http-seed.err; }
fi
[ -n "$SVN_HTTPS_URL" ] && HSU="$SVN_HTTPS_URL"
webcheck() {  # $1 = label, $2 = address, $3.. = extra svn options
  L=$1; WU=$2; shift 2
  sw() { printf %s "$PW_PASS" | svn "$@" $WOPT --non-interactive --no-auth-cache --username alice --password-from-stdin; }
  WOPT="$*"
  sw info "$WU" > /dev/null 2> svn-web.err; res $? "SVN $L  log in to the server"
  [ "$(sw list -R "$WU" | grep -v '/$' | sort | tr '\n' ' ')" = "docs/notes.txt readme.txt " ]; res $? "SVN $L  see the list of files"
  [ "$(sw cat "$WU/readme.txt")" = two-svn ]; res $? "SVN $L  read a file"
  [ "$(sw log -q "$WU" | grep -c '^r')" = 2 ]; res $? "SVN $L  see the history"
  [ "$(sw log -q "$WU/docs/notes.txt" | grep -c '^r')" = 1 ]; res $? "SVN $L  see the history of one file"
  ! grep -rqs "s3cret-XYZ" "$HOME/.subversion" "$APPDATA/Subversion"; res $? "SVN $L  password is in no file"
  PW_PASS=wrong sw info "$WU" > /dev/null 2>&1; [ $? != 0 ]; res $? "SVN $L  wrong login is refused"
  [ -s svn-web.err ] && { echo "--- svn $L:"; tail -3 svn-web.err; }
}
if [ "$SVN_WEB_ONLY" = https ]; then :; elif [ -n "$HU" ]; then webcheck http "$HU"; else skip "SVN http  all functions" "no SVN web server on this machine"; fi
if [ "$SVN_WEB_ONLY" = http ]; then :; elif [ -n "$HSU" ]; then
  if [ -n "$SVN_HTTPS_URL" ]; then webcheck https "$HSU" --trust-server-cert-failures=unknown-ca,cn-mismatch   # Windows test server: own test certificate
  else webcheck https "$HSU" --config-option "servers:global:ssl-authority-files=$(nat "$T")/tls.pem"; fi
else skip "SVN https  all functions" "no SVN https server on this machine"; fi
[ -n "$APACHE" ] && "$APACHE" -f "$T/httpd.conf" -k stop 2>/dev/null
for f in httpd.err logs/error.log; do [ -s $f ] && { echo "--- $f:"; tail -3 $f; }; done


echo "failed: $FAILS"
[ $FAILS = 0 ]
