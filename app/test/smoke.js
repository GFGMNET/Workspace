#!/usr/bin/env node
// Smoke test: runs against a temporary copy of the workspace. `npm test`
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const { spawnSync, spawn } = require('child_process');
const repo = path.resolve(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-'));
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
process.env.WORKSPACE_DIR = tmp;
const ws = require('../lib/workspace');
ok('first start: data folder with starter features', () => { ws.ensureWorkspace(); assert(fs.existsSync(path.join(tmp, 'features', 'wiki.yaml'))); assert.strictEqual(ws.listProjects().length, 0); });
ok('deleted starter features are not re-added on update', () => {
  fs.rmSync(path.join(tmp, 'features', 'contacts.yaml')); fs.writeFileSync(path.join(tmp, 'features', 'wiki.yaml'), 'name: My wiki\nstores: markdown\n');
  ws.ensureWorkspace();
  assert(!fs.existsSync(path.join(tmp, 'features', 'contacts.yaml'))); assert(/My wiki/.test(fs.readFileSync(path.join(tmp, 'features', 'wiki.yaml'), 'utf8')));
  fs.copyFileSync(path.join(repo, 'app', 'starter', 'features', 'contacts.yaml'), path.join(tmp, 'features', 'contacts.yaml'));
  fs.copyFileSync(path.join(repo, 'app', 'starter', 'features', 'wiki.yaml'), path.join(tmp, 'features', 'wiki.yaml'));
});
ok('example projects can be added', () => assert.strictEqual(ws.addExamples().length, 3));
const YAML = require('../lib/yaml');

ok('YAML: the original example with sloppy indentation', () => {
  const d = YAML.parse('---\nname: test\n wiki:\n   - a wiki page\n knowlege:\n   - a knowlegde based\n');
  assert.deepStrictEqual(d, { name: 'test', wiki: ['a wiki page'], knowlege: ['a knowlegde based'] });
});
ok('YAML: round trip', () => {
  const v = { name: 'x: y', list: ['a', { b: 1, c: [1, 2] }], text: 'two\nlines\n', flag: true, empty: null };
  assert.deepStrictEqual(YAML.parse(YAML.stringify(v)), v);
});
ok('YAML: errors name the line', () => assert.throws(() => YAML.parse('a: 1\n  b: [\n- : :'), /Line 3/));
ok('features load', () => assert(ws.listFeatures().length >= 10));
ok('alias "knowlege" maps to knowledge', () => {
  const p = ws.createProject({ name: 'Alias test', yaml: 'name: Alias test\nknowlege:\n  - First\n' });
  assert.strictEqual(p.features[0].feature, 'knowledge');
  assert.strictEqual(ws.listItems(p.slug, 'knowlege').items[0].title, 'First');
});
ok('records: create, read, write, trash', () => {
  const p = ws.createProject({ name: 'Rec test', yaml: 'name: Rec test\ntasks:\n' });
  const { id } = ws.createItem(p.slug, 'tasks', { title: 'Do it', data: { status: 'Doing' } });
  assert.strictEqual(ws.readItem(p.slug, 'tasks', id).data.status, 'Doing');
  ws.writeItem(p.slug, 'tasks', id, { data: { title: 'Do it', status: 'Done' } });
  assert.strictEqual(ws.listItems(p.slug, 'tasks').items[0].data.status, 'Done');
  ws.trashItem(p.slug, 'tasks', id);
  assert.strictEqual(ws.listItems(p.slug, 'tasks').items.length, 0);
});
ok('mcp feature writes .mcp.json', () => {
  const j = JSON.parse(fs.readFileSync(path.join(tmp, 'projects', 'test-2', '.mcp.json'), 'utf8'));
  assert(j.mcpServers.filesystem && j.mcpServers.filesystem.command === 'npx');
});
ok('skills land in .claude/skills', () => assert(fs.existsSync(path.join(tmp, 'projects', 'test-2', '.claude', 'skills', 'an-skill-md-for-agent', 'SKILL.md'))));
ok('path traversal is refused', () => assert.throws(() => ws.readItem('test', 'wiki', '../../features/wiki')));
ok('links: [[Title]] across features + link fields -> mentioned in', () => {
  const who = ws.backlinks('home-lab', 'devices', 'router').map(b => b.feature + '/' + b.id).sort();
  assert.deepStrictEqual(who, ['tasks/replace-the-old-switch', 'wiki/home']);
});
ok('overview lists upcoming dates and open tasks', () => { const o = ws.projectOverview('home-lab', 100000); assert(o.upcoming.length >= 2 && o.open.length === 2); });
ok('explorer: tree, write, rename, trash; stays inside the folder', () => {
  const files = require('../lib/files');
  assert(files.tree('p/home-lab').children.some(n => n.name === 'project.yaml'));
  files.writeFile('p/home-lab', 'scripts/hello.ps1', 'Write-Host hi', { create: true });
  assert.throws(() => files.writeFile('p/home-lab', 'scripts/hello.ps1', 'x', { create: true }), /exists/);
  files.rename('p/home-lab', 'scripts/hello.ps1', 'scripts/hi.ps1');
  assert.strictEqual(files.readFile('p/home-lab', 'scripts/hi.ps1').content, 'Write-Host hi');
  files.trash('p/home-lab', 'scripts/hi.ps1');
  assert.throws(() => files.readFile('p/home-lab', 'scripts/hi.ps1'), /not found/i);
  assert.throws(() => files.readFile('p/home-lab', '../test/project.yaml'), /outside/i);
  assert.throws(() => files.writeFile('p/home-lab', 'project.yaml', 'a: [\n- : :'), /YAML/);
});
ok('search finds content', () => assert(ws.search('wireguard').length >= 1));

// MCP server handshake
const mcp = spawnSync(process.execPath, [path.join(__dirname, '..', 'mcp.js')], {
  input: [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_projects', arguments: {} } }].map(x => JSON.stringify(x)).join('\n') + '\n',
  env: { ...process.env, WORKSPACE_DIR: tmp }, encoding: 'utf8' });
const replies = mcp.stdout.trim().split('\n').map(l => JSON.parse(l));
ok('MCP: initialize + tools/list + tools/call', () => {
  assert.strictEqual(replies.length, 3);
  assert(replies[1].result.tools.some(t => t.name === 'create_item'));
  assert(JSON.parse(replies[2].result.content[0].text).some(p => p.id === 'home-lab'));
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  ${n} checks passed\n`);
