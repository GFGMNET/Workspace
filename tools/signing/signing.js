// Release signing for Project Workspace (option C: the private key stays on the maintainer's PC).
//   new-key  [keyfile]            create a key pair; the private key is saved encrypted with a password
//   sign     <SHA256SUMS.txt> [keyfile]   write SHA256SUMS.txt.sig next to it
//   verify   <SHA256SUMS.txt> [publickey.pem]   check a signature
// Runs with Node.js or with the desktop app's own runtime (ELECTRON_RUN_AS_NODE=1), no packages.
// Formats: private key = PKCS#8 PEM, encrypted (AES-256-CBC, PBKDF2); public key = SPKI PEM;
// signature = base64 Ed25519 signature over the exact bytes of SHA256SUMS.txt.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// The desktop app's exe has no console on Windows: its output can't be seen there. signing.ps1 sets
// PW_SIGN_OUT to a file, and everything printed also goes there, to be shown by the script.
if (process.env.PW_SIGN_OUT) {
  const out = process.env.PW_SIGN_OUT;
  for (const k of ['log', 'error']) { const orig = console[k]; console[k] = (...a) => { try { fs.appendFileSync(out, a.join(' ') + '\n'); } catch {} orig(...a); }; }
}
const DEFAULT_KEY = path.join(os.homedir(), 'Documents', 'project-workspace-signing.key');
const PUBLIC_IN_APP = path.join(__dirname, '..', '..', 'app', 'lib', 'release-key.pem');

// Input without a terminal (piped, tests): one line per question.
let piped = null;
function nextLine() {
  if (!piped) {
    piped = { lines: [], waiting: [], buf: '' };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => { piped.buf += d; let i; while ((i = piped.buf.indexOf('\n')) >= 0) { const l = piped.buf.slice(0, i).replace(/\r$/, ''); piped.buf = piped.buf.slice(i + 1); const w = piped.waiting.shift(); w ? w(l) : piped.lines.push(l); } });
  }
  return new Promise(r => (piped.lines.length ? r(piped.lines.shift()) : piped.waiting.push(r)));
}
function askHidden(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    const stdin = process.stdin; let s = '';
    if (!stdin.isTTY) { nextLine().then(l => { process.stdout.write('\n'); resolve(l); }); return; }
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    const on = ch => {
      if (ch === '\r' || ch === '\n') { stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', on); process.stdout.write('\n'); resolve(s); }
      else if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
      else if (ch === '\u007f' || ch === '\b') s = s.slice(0, -1);
      else s += ch;
    };
    stdin.on('data', on);
  });
}
function ask(question) {
  process.stdout.write(question);
  if (!process.stdin.isTTY) return nextLine().then(l => l.trim());
  return new Promise(resolve => { process.stdin.resume(); process.stdin.setEncoding('utf8'); process.stdin.once('data', d => { process.stdin.pause(); resolve(String(d).trim()); }); });
}
const die = msg => { console.error('\n  ' + msg + '\n'); process.exit(1); };
// Non-interactive use (the Windows scripts ask in PowerShell and pass the answers on):
//   PW_SIGN_PASSWORD = the password, --yes = signing was confirmed.
const ARGS = process.argv.slice(2);
const FLAG_YES = ARGS.includes('--yes');
const ENV_PW = process.env.PW_SIGN_PASSWORD;
const password = q => (ENV_PW != null ? Promise.resolve(ENV_PW) : askHidden(q));

async function newKey(file = DEFAULT_KEY) {
  if (fs.existsSync(file)) die(`${file} already exists. Keep using it, or move it away first.`);
  console.log('\n  Creating the release signing key.\n  Choose a strong password (at least 12 characters). You need it for every release.\n');
  const pw = await password('  Password: '); const pw2 = ENV_PW != null ? ENV_PW : await askHidden('  Repeat:   ');
  if (pw !== pw2) die('The passwords are not the same.');
  if (pw.length < 12) die('The password is too short (at least 12 characters).');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: pw },
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, privateKey, { mode: 0o600 });
  fs.writeFileSync(file.replace(/\.key$/, '') + '.pub.pem', publicKey);
  console.log(`
  Done.

  PRIVATE key (keep it secret):  ${file}
    1. Save this file AND the password in your password manager now.
    2. Never upload it, never send it to anyone (also not to Claude).

  PUBLIC key (safe to share), also saved as ${file.replace(/\.key$/, '')}.pub.pem:

${publicKey.trim().split('\n').map(l => '    ' + l).join('\n')}

  Send the public key (the 3 lines above) so it can be built into the app.
`);
}

async function sign(sums, file = DEFAULT_KEY) {
  if (!sums || !fs.existsSync(sums)) die('Give the SHA256SUMS.txt you downloaded from the draft release (drag it onto sign-release.cmd).');
  if (!fs.existsSync(file)) die(`No private key at ${file}. Restore it from your password manager there, or give its path.`);
  const data = fs.readFileSync(sums);
  const text = data.toString('utf8');
  const lines = text.trim().split(/\r?\n/);
  if (!/^project-workspace v\d+\.\d+\.\d+/.test(lines[0] || '')) die('This does not look like a SHA256SUMS.txt of a Project Workspace release.');
  console.log(`\n  You are about to sign ${lines[0]}:\n`);
  for (const l of lines.slice(1)) console.log('    ' + l);
  console.log('\n  Only sign a release that you started yourself (Actions → Release) and expect.');
  const ok = FLAG_YES ? 'yes' : await ask('  Sign it? (yes/no) ');
  if (!/^y(es)?$/i.test(ok)) die('Not signed.');
  const pw = await password('  Password of the signing key: ');
  let key; try { key = crypto.createPrivateKey({ key: fs.readFileSync(file, 'utf8'), format: 'pem', passphrase: pw }); } catch { die('Wrong password, or not a signing key.'); }
  const sig = crypto.sign(null, data, key).toString('base64');
  fs.writeFileSync(sums + '.sig', sig + '\n');
  if (piped) process.stdin.pause();
  console.log(`\n  Signed: ${sums}.sig\n\n  Upload it to the draft release (Edit → drag the file into "Attach binaries"), then click "Publish release".\n`);
}

function verify(sums, pub = PUBLIC_IN_APP) {
  const ok = crypto.verify(null, fs.readFileSync(sums), crypto.createPublicKey(fs.readFileSync(pub, 'utf8')), Buffer.from(fs.readFileSync(sums + '.sig', 'utf8').trim(), 'base64'));
  console.log(ok ? '  Signature OK' : '  Signature WRONG'); process.exit(ok ? 0 : 1);
}

const [cmd, a, b] = ARGS.filter(x => x !== '--yes');
if (cmd === 'new-key') newKey(a);
else if (cmd === 'sign') sign(a, b);
else if (cmd === 'verify') verify(a, b);
else console.log('Usage: signing.js new-key [keyfile] | sign <SHA256SUMS.txt> [keyfile] | verify <SHA256SUMS.txt> [publickey.pem]');
