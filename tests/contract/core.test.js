// Contract: info, static files, features, projects (create, edit, rename, archive, delete), templates.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer } = require('./helpers');

let s;
before(async () => { s = await startServer(); });
after(() => s.stop());

test('info describes the installation', async () => {
  const r = await s.api('GET', '/api/info');
  assert.equal(r.status, 200);
  for (const k of ['version', 'root', 'stores', 'layouts', 'fieldTypes', 'platform', 'mcpCommand']) assert.ok(k in r.body, k);
  assert.ok(r.body.stores.includes('markdown'));
  assert.ok(r.body.layouts.records.includes('kanban'), 'layouts per storage type');
  const c = await s.api('GET', '/api/claude');
  assert.equal(c.body.ok, true); assert.match(c.body.version, /fake/);
});

test('the page and its scripts are served; unknown paths fall back to the page', async () => {
  for (const p of ['/', '/app.js', '/core.js', '/views.js', '/explorer.js', '/app.css', '/vendor/mermaid.min.js', '/some/route']) {
    const r = await s.api('GET', p, { raw: true });
    assert.equal(r.status, 200, p);
  }
  assert.match((await s.api('GET', '/', { raw: true })).headers['content-type'], /text\/html/);
  assert.equal((await s.api('GET', '/api/nope')).status, 404);
});

test('features: list, create, invalid definitions refused, sloppy YAML read with a warning, delete', async () => {
  const list = (await s.api('GET', '/api/features')).body;
  assert.ok(list.length >= 15);
  const wiki = list.find(f => f.key === 'wiki');
  assert.equal(wiki.def.stores, 'markdown'); assert.ok(Array.isArray(wiki.usedBy));
  const ok = await s.api('PUT', '/api/features/notes', { body: { yaml: 'name: Notes\nstores: markdown\nlayout: cards\n' } });
  assert.equal(ok.status, 200);
  assert.ok(fs.existsSync(path.join(s.dir, 'features', 'notes.yaml')));
  for (const yaml of ['name: X\nstores: nonsense\n', '- a\n- b\n', 'name: X\nstores: markdown\nlayout: kanban\n']) {
    const bad = await s.api('PUT', '/api/features/broken', { body: { yaml } });
    assert.equal(bad.status, 400, yaml); assert.ok(bad.body.error);
  }
  const sloppy = await s.api('PUT', '/api/features/sloppy', { body: { yaml: 'name: [unclosed\n' } });
  assert.equal(sloppy.status, 200); assert.match(sloppy.body.warning, /Line 2/);
  await s.api('DELETE', '/api/features/sloppy');
  assert.equal((await s.api('DELETE', '/api/features/notes')).status, 200);
  assert.ok(!fs.existsSync(path.join(s.dir, 'features', 'notes.yaml')));
});

test('the original sloppy example YAML works (typos, shifted indentation)', async () => {
  const yaml = 'name: Project 1\n wiki:\n  - some page\n knowlege:\n  - kb entry\n skils:\n  - a skill\n';
  const r = await s.api('POST', '/api/projects', { body: { name: 'Sloppy', yaml } });
  assert.equal(r.status, 200);
  const keys = r.body.features.map(f => f.key);
  assert.ok(keys.includes('wiki') && keys.includes('knowlege') && keys.includes('skils'));
  assert.ok(r.body.features.every(f => !f.missing), 'aliases map to knowledge and skills');
});

test('projects: create, read, save project.yaml, add and remove a feature', async () => {
  const c = await s.api('POST', '/api/projects', { body: { name: 'Contract One', yaml: 'name: Contract One\nwiki:\n  - First page\ntasks:\n' } });
  assert.equal(c.status, 200);
  const slug = c.body.slug; assert.equal(slug, 'contract-one');
  assert.ok(fs.existsSync(path.join(s.dir, 'projects', slug, 'project.yaml')));
  assert.ok(fs.existsSync(path.join(s.dir, 'projects', slug, 'wiki', 'first-page.md')), 'seed item created');
  const p = (await s.api('GET', `/api/projects/${slug}`)).body;
  assert.equal(p.name, 'Contract One'); assert.deepEqual(p.features.map(f => f.key), ['wiki', 'tasks']);
  const list = (await s.api('GET', '/api/projects')).body;
  assert.ok(list.some(x => x.slug === slug));
  const bad = await s.api('PUT', `/api/projects/${slug}/yaml`, { body: { yaml: '- not a mapping\n' } });
  assert.equal(bad.status, 400);
  const add = await s.api('POST', `/api/projects/${slug}/features`, { body: { key: 'calendar' } });
  assert.equal(add.status, 200); assert.ok(add.body.features.some(f => f.key === 'calendar'));
  const text = fs.readFileSync(path.join(s.dir, 'projects', slug, 'project.yaml'), 'utf8');
  assert.match(text, /^calendar:/m);
  const rm = await s.api('DELETE', `/api/projects/${slug}/features/calendar`);
  assert.ok(!rm.body.features.some(f => f.key === 'calendar'));
  const dup = await s.api('POST', `/api/projects/${slug}/features`, { body: { key: 'wiki' } });
  assert.equal(dup.status, 400);
});

test('projects: rename (name only, and with folder), archive, restore, delete', async () => {
  const { slug } = (await s.api('POST', '/api/projects', { body: { name: 'Old Name' } })).body;
  const r1 = await s.api('PATCH', `/api/projects/${slug}`, { body: { name: 'New Name', folder: false } });
  assert.equal(r1.body.name, 'New Name'); assert.equal(r1.body.slug, slug);
  const r2 = await s.api('PATCH', `/api/projects/${slug}`, { body: { name: 'New Name', folder: true } });
  assert.equal(r2.body.slug, 'new-name');
  assert.equal((await s.api('POST', '/api/projects/new-name/archive', { body: {} })).status, 200);
  assert.ok(!(await s.api('GET', '/api/projects')).body.some(p => p.slug === 'new-name'));
  const arch = (await s.api('GET', '/api/archive')).body;
  assert.ok(arch.some(a => a.slug === 'new-name' || a.name === 'New Name'));
  const id = arch.find(a => a.name === 'New Name').slug;
  const back = await s.api('POST', `/api/archive/${id}/restore`, { body: {} });
  assert.equal(back.status, 200);
  assert.equal((await s.api('DELETE', `/api/projects/${back.body.slug}`)).status, 200);
  assert.ok(!fs.existsSync(path.join(s.dir, 'projects', back.body.slug)));
  assert.equal((await s.api('GET', `/api/projects/${back.body.slug}`)).status, 404);
});

test('templates: save with content, list, new project from it, delete', async () => {
  const t = await s.api('POST', '/api/projects/home-lab/template', { body: { name: 'Lab template', description: 'd', content: true } });
  assert.equal(t.status, 200); assert.equal(t.body.content, true);
  assert.ok(t.body.features.includes('wiki'));
  assert.ok(!/^location:/m.test(t.body.yaml));
  assert.ok(!fs.existsSync(path.join(s.dir, 'templates', t.body.id, 'chats')), 'chats are never copied');
  const list = (await s.api('GET', '/api/templates')).body;
  assert.ok(list.some(x => x.id === t.body.id));
  const p = await s.api('POST', '/api/projects', { body: { name: 'From Template', yaml: t.body.yaml.replace(/^name:.*$/m, 'name: From Template'), template: t.body.id } });
  assert.equal(p.status, 200);
  assert.ok(fs.existsSync(path.join(s.dir, 'projects', p.body.slug, 'wiki', 'home.md')));
  assert.equal((await s.api('DELETE', `/api/templates/${t.body.id}`)).status, 200);
  assert.equal((await s.api('POST', '/api/projects', { body: { name: 'X', template: 'nope' } })).status, 404);
});
