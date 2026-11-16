// Contract: explorer (files of a project or the workspace), private files, path checks, host/origin checks,
// secrets (never returned, only referenced), the /ide frame guard.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { startServer } = require('./helpers');

let s;
before(async () => { s = await startServer(); });
after(() => s.stop());
const FS = '/api/fs';
const q = (scope, p) => `?scope=${encodeURIComponent(scope)}&path=${encodeURIComponent(p)}`;

test('explorer: tree, read, write, new file, folder, rename, upload, raw, trash', async () => {
  const t = (await s.api('GET', `${FS}/tree${q('p/home-lab', '')}`)).body;
  assert.ok(t.children.some(c => c.name === 'project.yaml' && !c.dir));
  assert.ok(t.children.some(c => c.name === 'wiki' && c.dir && Array.isArray(c.children)));
  const f = (await s.api('GET', `${FS}/file${q('p/home-lab', 'project.yaml')}`)).body;
  assert.equal(f.text, true); assert.match(f.content, /^name:/m);
  assert.equal((await s.api('PUT', `${FS}/file${q('p/home-lab', 'notes/new.txt')}&create=1`, { body: { content: 'hello' } })).status, 200);
  assert.equal(fs.readFileSync(path.join(s.dir, 'projects', 'home-lab', 'notes', 'new.txt'), 'utf8'), 'hello');
  assert.equal((await s.api('POST', `${FS}/mkdir${q('p/home-lab', 'notes/sub')}`, { body: {} })).status, 200);
  assert.equal((await s.api('POST', `${FS}/rename?scope=p/home-lab`, { body: { from: 'notes/new.txt', to: 'notes/sub/renamed.txt' } })).status, 200);
  assert.ok(fs.existsSync(path.join(s.dir, 'projects', 'home-lab', 'notes', 'sub', 'renamed.txt')));
  const up = await s.api('POST', `${FS}/upload${q('p/home-lab', 'notes')}&filename=data.bin`, { body: Buffer.from([0, 1, 2, 3]), headers: { 'Content-Type': 'application/octet-stream' } });
  assert.equal(up.status, 200);
  const raw = await s.api('GET', `${FS}/raw${q('p/home-lab', 'notes/data.bin')}`, { raw: true });
  assert.equal(raw.status, 200); assert.deepEqual([...raw.buf], [0, 1, 2, 3]);
  const dl = await s.api('GET', `${FS}/raw${q('p/home-lab', 'notes/data.bin')}&download=1`, { raw: true });
  assert.match(dl.headers['content-disposition'] || '', /attachment/);
  const bin = (await s.api('GET', `${FS}/file${q('p/home-lab', 'notes/data.bin')}`)).body;
  assert.equal(bin.binary, true);
  assert.equal((await s.api('POST', `${FS}/trash${q('p/home-lab', 'notes/sub')}`, { body: {} })).status, 200);
  assert.ok(!fs.existsSync(path.join(s.dir, 'projects', 'home-lab', 'notes', 'sub')));
  const bad = await s.api('PUT', `${FS}/file${q('p/home-lab', 'project.yaml')}`, { body: { content: '- not: [valid\n' } });
  assert.equal(bad.status, 400, 'project.yaml is checked before saving');
});

test('explorer: the workspace scope, no way outside, private files hidden', async () => {
  const t = (await s.api('GET', `${FS}/tree${q('workspace', '')}`)).body;
  const names = t.children.map(c => c.name);
  assert.ok(names.includes('projects') && names.includes('features'));
  await s.api('PUT', '/api/secrets/contract', { body: { value: 'x' } });
  const t2 = (await s.api('GET', `${FS}/tree${q('workspace', '')}`)).body.children.map(c => c.name);
  for (const p of ['.secrets.json', '.ide-token', '.app']) assert.ok(!t2.includes(p), p + ' is not listed');
  assert.equal((await s.api('GET', `${FS}/file${q('workspace', '.secrets.json')}`)).status, 403);
  assert.equal((await s.api('GET', `${FS}/raw${q('workspace', '.secrets.json')}`, { raw: true })).status, 403);
  for (const p of ['../outside.txt', '../../etc/passwd', 'projects/../../x']) {
    const r = await s.api('GET', `${FS}/file${q('workspace', p)}`);
    assert.ok(r.status === 400 || r.status === 404, p);
  }
  assert.equal((await s.api('GET', `${FS}/tree?scope=nonsense`)).status, 400);
});

test('requests for other host names are refused (DNS rebinding)', async () => {
  const r = await s.api('GET', '/api/info', { host: 'evil.example.com' });
  assert.equal(r.status, 403);
  assert.equal((await s.api('GET', '/api/info', { host: `localhost:${s.port}` })).status, 200);
});

test('changes from other websites are refused (CSRF); the app itself and tools are allowed', async () => {
  const evil = await s.api('POST', '/api/projects', { body: { name: 'Evil' }, headers: { Origin: 'https://evil.example.com' } });
  assert.equal(evil.status, 403);
  const own = await s.api('POST', '/api/projects', { body: { name: 'Own' }, headers: { Origin: `http://localhost:${s.port}` } });
  assert.equal(own.status, 200);
  const tool = await s.api('POST', '/api/projects', { body: { name: 'No origin' } });
  assert.equal(tool.status, 200);
});

test('WebSockets from other websites are refused', async () => {
  const res = await new Promise(resolve => {
    const c = net.connect(s.port, '127.0.0.1', () => c.write(`GET /ide/x HTTP/1.1\r\nHost: 127.0.0.1:${s.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nOrigin: https://evil.example.com\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    let got = ''; c.on('data', d => { got += d; }); c.on('close', () => resolve(got)); setTimeout(() => { c.destroy(); resolve(got); }, 3000);
  });
  assert.ok(!/101 Switching/.test(res));
});

test('a frame that leaves /ide is sent back under /ide (the app never loads inside itself)', async () => {
  const r = await s.api('GET', '/?folder=/x', { raw: true, headers: { 'Sec-Fetch-Dest': 'iframe' } });
  assert.equal(r.status, 302); assert.match(r.headers.location, /^\/ide\/\?folder=/);
});

test('secrets: saved encrypted, never returned, used as ${PW_SECRET_…} in .mcp.json', async () => {
  const put = await s.api('PUT', '/api/secrets/gh-token', { body: { value: 'supersecret-123' } });
  assert.equal(put.status, 200);
  const st = (await s.api('GET', '/api/secrets')).body;
  assert.ok(st.items.some(i => i.name === 'gh-token' && i.env === 'PW_SECRET_GH_TOKEN'));
  assert.ok(!JSON.stringify(st).includes('supersecret'));
  assert.ok(!fs.readFileSync(path.join(s.dir, '.secrets.json'), 'utf8').includes('supersecret'));
  assert.equal((await s.api('PUT', '/api/secrets/bad%20name', { body: { value: 'x' } })).status, 400);
  assert.equal((await s.api('PUT', '/api/secrets/empty', { body: { value: '' } })).status, 400);
  await s.api('POST', '/api/projects/test-2/f/mcp/items', { body: { title: 'remote', data: { name: 'remote', transport: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer ${secret:gh-token}' } } } });
  const mcp = fs.readFileSync(path.join(s.dir, 'projects', 'test-2', '.mcp.json'), 'utf8');
  assert.match(mcp, /Bearer \$\{PW_SECRET_GH_TOKEN\}/); assert.ok(!mcp.includes('supersecret'));
  assert.equal((await s.api('DELETE', '/api/secrets/gh-token')).status, 200);
  assert.ok(!(await s.api('GET', '/api/secrets')).body.items.some(i => i.name === 'gh-token'));
});
