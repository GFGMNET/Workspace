// Contract: items of every storage type, uploads, raw project files, search, links, overview, due.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer } = require('./helpers');

let s;
const P = '/api/projects';
before(async () => { s = await startServer(); });
after(() => s.stop());

test('markdown pages: list, create, read, write, trash', async () => {
  const list = (await s.api('GET', `${P}/home-lab/f/wiki/items`)).body.items;
  const home = list.find(i => i.id === 'home');
  assert.ok(home && home.title && home.file === 'wiki/home.md' && typeof home.modified === 'number');
  const c = await s.api('POST', `${P}/home-lab/f/wiki/items`, { body: { title: 'Contract Page', content: 'First line\n\nSee [[Home]].' } });
  assert.equal(c.status, 200); assert.equal(c.body.id, 'contract-page');
  const r = (await s.api('GET', `${P}/home-lab/f/wiki/items/contract-page`)).body;
  assert.match(r.content, /See \[\[Home\]\]/);
  const w = await s.api('PUT', `${P}/home-lab/f/wiki/items/contract-page`, { body: { content: '# Contract Page\n\nchanged' } });
  assert.equal(w.status, 200);
  assert.match(fs.readFileSync(path.join(s.dir, 'projects', 'home-lab', 'wiki', 'contract-page.md'), 'utf8'), /changed/);
  assert.equal((await s.api('DELETE', `${P}/home-lab/f/wiki/items/contract-page`)).status, 200);
  assert.ok(!fs.existsSync(path.join(s.dir, 'projects', 'home-lab', 'wiki', 'contract-page.md')));
  assert.ok(fs.readdirSync(path.join(s.dir, 'projects', 'home-lab', '.trash'), { recursive: true }).some(f => String(f).includes('contract-page')), 'deleted items go to .trash');
});

test('records: create, read, write keeps comments, unknown fields kept', async () => {
  const file = path.join(s.dir, 'projects', 'home-lab', 'devices', 'router.yaml');
  fs.writeFileSync(file, '# my router\nname: Router\nip: 192.168.1.1 # fixed\nkind: router\n');
  const r = (await s.api('GET', `${P}/home-lab/f/devices/items/router`)).body;
  assert.equal(r.data.ip, '192.168.1.1');
  const w = await s.api('PUT', `${P}/home-lab/f/devices/items/router`, { body: { data: { ...r.data, ip: '192.168.1.2', extra: 'kept' } } });
  assert.equal(w.status, 200); assert.equal(w.body.data.ip, '192.168.1.2');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /# my router/); assert.match(text, /# fixed/); assert.match(text, /extra: kept/);
  const c = await s.api('POST', `${P}/home-lab/f/tasks/items`, { body: { title: 'Contract task', data: { title: 'Contract task', status: 'To do', due: '2030-01-02' } } });
  assert.equal(c.body.id, 'contract-task');
  const t = (await s.api('GET', `${P}/home-lab/f/tasks/items`)).body.items.find(i => i.id === 'contract-task');
  assert.equal(t.data.status, 'To do'); assert.equal(t.file, 'tasks/contract-task.yaml');
});

test('diagrams: create and read Mermaid text', async () => {
  const c = await s.api('POST', `${P}/home-lab/f/diagrams/items`, { body: { title: 'Flow', content: 'flowchart LR\n  A --> B\n' } });
  assert.equal(c.status, 200);
  const r = (await s.api('GET', `${P}/home-lab/f/diagrams/items/${c.body.id}`)).body;
  assert.match(r.content, /A --> B/);
  assert.ok((await s.api('GET', `${P}/home-lab/f/diagrams/items`)).body.items.some(i => i.id === c.body.id));
});

test('pictures and files: upload, list by folder, raw file, trash', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const u = await s.api('POST', `${P}/test/f/gallery/upload?folder=Contract%20Album&filename=pic.png`, { body: png, headers: { 'Content-Type': 'application/octet-stream' } });
  assert.equal(u.status, 200); assert.equal(u.body.name, 'pic.png');
  const g = (await s.api('GET', `${P}/test/f/gallery/items`)).body;
  assert.ok(Array.isArray(g.folders) && Array.isArray(g.files));
  assert.ok(g.folders.some(f => f.id === 'Contract Album'));
  const raw = await s.api('GET', '/files/test/gallery/Contract%20Album/pic.png', { raw: true });
  assert.equal(raw.status, 200); assert.equal(raw.headers['content-type'], 'image/png'); assert.ok(raw.buf.equals(png));
  const again = await s.api('POST', `${P}/test/f/gallery/upload?folder=Contract%20Album&filename=pic.png`, { body: png, headers: { 'Content-Type': 'application/octet-stream' } });
  assert.notEqual(again.body.name, 'pic.png', 'an existing name is not overwritten');
  assert.equal((await s.api('POST', `${P}/test/f/gallery/trash`, { body: { path: 'gallery/Contract Album/pic.png' } })).status, 200);
  assert.equal((await s.api('GET', '/files/test/gallery/Contract%20Album/pic.png', { raw: true })).status, 404);
  assert.equal((await s.api('GET', '/files/test/..%2F..%2Fsettings.yaml', { raw: true })).status >= 400, true, 'no way out of the project');
});

test('search, link index and backlinks ("mentioned in")', async () => {
  const hits = (await s.api('GET', '/api/search?q=wireguard')).body;
  assert.ok(hits.length >= 1);
  for (const k of ['project', 'projectName', 'feature', 'id', 'title', 'snippet']) assert.ok(k in hits[0], k);
  const one = (await s.api('GET', '/api/search?q=wireguard&project=home-lab')).body;
  assert.ok(one.every(h => h.project === 'home-lab'));
  const idx = (await s.api('GET', `${P}/home-lab/index`)).body;
  assert.ok(idx.some(i => i.feature === 'wiki' && i.id === 'home' && i.title));
  await s.api('POST', `${P}/home-lab/f/wiki/items`, { body: { title: 'Links here', content: 'Back to [[Home]] and [[devices/router]].' } });
  const bl = (await s.api('GET', `${P}/home-lab/backlinks?feature=wiki&id=home`)).body;
  assert.ok(bl.some(b => b.id === 'links-here' && b.how));
  const bl2 = (await s.api('GET', `${P}/home-lab/backlinks?feature=devices&id=router`)).body;
  assert.ok(bl2.some(b => b.id === 'links-here'));
});

test('overview and what is due', async () => {
  const today = new Date(); const iso = d => d.toISOString().slice(0, 10);
  await s.api('POST', `${P}/home-lab/f/tasks/items`, { body: { title: 'Due today', data: { title: 'Due today', status: 'To do', due: iso(today) } } });
  await s.api('POST', `${P}/home-lab/f/tasks/items`, { body: { title: 'Overdue', data: { title: 'Overdue', status: 'To do', due: '2020-01-01' } } });
  const o = (await s.api('GET', `${P}/home-lab/overview`)).body;
  for (const k of ['name', 'today', 'days', 'tiles', 'upcoming', 'open', 'openTotal', 'recent']) assert.ok(k in o, k);
  assert.ok(o.tiles.some(t => t.key === 'wiki' && typeof t.count === 'number'));
  assert.ok(o.upcoming.some(u => u.title === 'Overdue' && u.overdue));
  const due = (await s.api('GET', '/api/due?days=14')).body;
  assert.equal(due.days, 14);
  const first = due.items[0];
  assert.equal(first.title, 'Overdue', 'overdue items first');
  for (const k of ['project', 'projectName', 'feature', 'featureName', 'id', 'date', 'field']) assert.ok(k in first, k);
  assert.ok(due.items.some(i => i.title === 'Due today'));
});

test('unknown project, feature or item: 404 with a message', async () => {
  for (const p of [`${P}/nope`, `${P}/home-lab/f/nope/items`, `${P}/home-lab/f/wiki/items/nope`]) {
    const r = await s.api('GET', p);
    assert.ok(r.status === 404 || r.status === 400, p); assert.ok(r.body.error, p);
  }
});
