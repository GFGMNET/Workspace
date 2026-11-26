// Version Control (plan docs/plans/VERSION-CONTROL.md): files and history of a Git repository over http with a login,
// read only. Uses the test server from the plan check (python3 + git-http-backend). Only the Rust server (1.0) has it.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const net = require('node:net');
const { startServer } = require('./helpers');

const have = c => { try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } };
const PY = ['python3', 'python'].find(have);
const RUST = !!process.env.PW_SERVER_CMD && have('git') && !!PY;
let s, srv, tmp, port;
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=Anna', '-c', 'user.email=a@x', ...a], { cwd, stdio: 'pipe' }).toString();
const freePort = () => new Promise(r => { const x = net.createServer().listen(0, '127.0.0.1', () => { const p = x.address().port; x.close(() => r(p)); }); });

before(async () => {
  if (!RUST) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-vcs-'));
  const work = path.join(tmp, 'work'); fs.mkdirSync(path.join(work, 'src'), { recursive: true });
  git(tmp, 'init', '-q', '-b', 'main', work);
  fs.writeFileSync(path.join(work, 'README.md'), '# Demo\n'); git(work, 'add', '.'); git(work, 'commit', '-qm', 'First version');
  fs.writeFileSync(path.join(work, 'src', 'main.c'), 'int main(){return 0;}\n'); git(work, 'add', '.'); git(work, 'commit', '-qm', 'Add main');
  fs.writeFileSync(path.join(work, 'README.md'), '# Demo\nMore.\n'); git(work, 'commit', '-qam', 'Update readme');
  execFileSync('git', ['clone', '-q', '--bare', work, path.join(tmp, 'srv', 'demo.git')]);
  port = await freePort();
  srv = spawn(PY, [path.resolve(__dirname, '../../docs/plans/checks/version-control-server.py'), path.join(tmp, 'srv'), String(port)], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { if (await new Promise(r => { const c = net.connect(port, '127.0.0.1', () => { c.end(); r(true); }).on('error', () => r(false)); })) break; await new Promise(r => setTimeout(r, 100)); }
  s = await startServer({ examples: false });
  const slug = (await s.api('POST', '/api/projects', { body: { name: 'VC' } })).body.slug;
  await s.api('PUT', '/api/secrets/git-pass', { body: { value: 's3cret-XYZ' } });
  await s.api('PUT', '/api/secrets/wrong-pass', { body: { value: 'nope' } });
  const block = (k, pw) => `${k}:\n  feature: version-control\n  type: git\n  protocol: http\n  server: 127.0.0.1\n  port: ${port}\n  path: demo.git\n  user: alice\n  password: \${secret:${pw}}\n`;
  await s.api('PUT', `/api/projects/${slug}/yaml`, { body: { yaml: `name: VC\n${block('version-control', 'git-pass')}${block('bad', 'wrong-pass')}` } });
});
after(async () => { if (s) await s.stop(); if (srv) srv.kill(); if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

const B = '/api/projects/vc/f/version-control/vcs';
test('vcs: lists the files of the repository', { skip: !RUST }, async () => {
  const r = await s.api('GET', `${B}/files?refresh=1`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.type, 'git');
  assert.deepEqual([...r.body.files].sort(), ['README.md', 'src/main.c']);
});
test('vcs: shows one file', { skip: !RUST }, async () => {
  const r = await s.api('GET', `${B}/file?path=README.md`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.text, '# Demo\nMore.\n');
});
test('vcs: history of everything and of one file', { skip: !RUST }, async () => {
  const all = await s.api('GET', `${B}/history`);
  assert.equal(all.status, 200, JSON.stringify(all.body));
  assert.deepEqual(all.body.history.map(c => c.message), ['Update readme', 'Add main', 'First version']);
  assert.equal(all.body.history[0].author, 'Anna');
  assert.ok(all.body.history[1].files.includes('src/main.c'));
  const one = await s.api('GET', `${B}/history?path=src/main.c`);
  assert.deepEqual(one.body.history.map(c => c.message), ['Add main']);
});
test('vcs: a wrong password is refused and never shown', { skip: !RUST }, async () => {
  const r = await s.api('GET', '/api/projects/vc/f/bad/vcs/files?refresh=1');
  assert.ok(r.status >= 400, JSON.stringify(r.body));
  assert.ok(!JSON.stringify(r.body).includes('nope'));
});
test('vcs: the password is in no file of the project', { skip: !RUST }, async () => {
  const dir = path.join(s.dir, 'projects', 'vc');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(dir)) assert.ok(!fs.readFileSync(f).includes('s3cret-XYZ'), f);
});
test('vcs: a path outside the repository is refused', { skip: !RUST }, async () => {
  const r = await s.api('GET', `${B}/file?path=../../etc/passwd`);
  assert.ok(r.status >= 400);
});
