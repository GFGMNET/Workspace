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
ok('example projects can be added', () => assert.strictEqual(ws.addExamples().length, 4));
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
ok('updates: version compare + unzip (incl. unsafe paths refused)', () => {
  const up = require('../lib/updater'); const zlib = require('zlib');
  assert(up.newer('0.10.0', '0.9.3') && up.newer('v1.0.0', '0.9.9') && !up.newer('0.3.0', '0.3.0') && !up.newer('0.2.9', '0.3.0'));
  const mk = (name, data) => { const raw = Buffer.from(data); const comp = zlib.deflateRawSync(raw); const nm = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nm.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(raw.length, 24); cen.writeUInt16LE(nm.length, 28);
    return { local: Buffer.concat([local, nm, comp]), cen: Buffer.concat([cen, nm]) }; };
  const zip = entries => { let off = 0; const L = [], C = []; for (const e of entries) { e.cen.writeUInt32LE(off, 42); off += e.local.length; L.push(e.local); C.push(e.cen); }
    const cd = Buffer.concat(C); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
    return Buffer.concat([...L, cd, end]); };
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-zip-'));
  up.unzip(zip([mk('top/app/hello.txt', 'hi there')]), out);
  assert.strictEqual(fs.readFileSync(path.join(out, 'top/app/hello.txt'), 'utf8'), 'hi there');
  assert.throws(() => up.unzip(zip([mk('../evil.txt', 'x')]), out), /Unsafe/);
  fs.rmSync(out, { recursive: true, force: true });
});
ok('location: project content in an existing folder ({install})', () => {
  const p = ws.loadProject('workspace-dev');
  assert(p.external && p.dir === ws.INSTALL_DIR && !p.error);
  assert(ws.listItems('workspace-dev', 'docs').items.some(i => i.id === 'DESIGN'));
  assert.strictEqual(require('../lib/files').readFile('p/workspace-dev', 'package.json').name, 'package.json');
  fs.writeFileSync(path.join(tmp, 'projects', 'workspace-dev', 'project.yaml'), 'name: x\nlocation: /does/not/exist\nwiki:\n');
  assert(/does not exist/.test(ws.loadProject('workspace-dev').error));
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
